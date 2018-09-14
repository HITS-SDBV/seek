/*
Code adapted and modified from:

Copyright (c) 2012, Kai Chang
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* The name Kai Chang may not be used to endorse or promote products
  derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL MICHAEL BOSTOCK BE LIABLE FOR ANY DIRECT,
INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

d3.parcoords = function(config) {
    var __ = {
        data: [],
        highlighted: [],
        dimensions: [],
        dimensionTitles: {},
        dimensionTitleRotation: 0,
        types: {},
        brushed: false,
        mode: "default",
        rate: 20,
        x_translate: 0, //-40??
        y_translate: -60,
        maxOrdinalTicks: 50,
        width: "1400",
        height: 520,
        missingAxisOffset: "30",
        wrapFont: '12px sans-serif', //default font for label width calculation
        deltaPx: 10,    //substract from allowed pixel width when computing label wrap length
        margin: { top: 30, right: 0, bottom: 12, left: 0 },
        color: "#069",
        composite: "source-over",
        alpha: 0.7,
        bundlingStrength: 0.5,
        bundleDimension: null,
        smoothness: 0.25,
        showControlPoints: false,
        reorder_dim: [],
        minValues: {},
        hideAxis : []
    };

    extend(__, config);

    var pc = function(selection) {
        selection = pc.selection = d3.select(selection);
        //__.width = selection[0][0].clientWidth;
        //__.height = selection[0][0].clientHeight;

        // canvas data layers
        ["shadows", "marks", "foreground", "highlight"].forEach(function(layer) {
            canvas[layer] = selection
                .append("canvas")
                .attr("class", layer)[0][0];
            ctx[layer] = canvas[layer].getContext("2d");
        });

        // svg tick and brush layers
        pc.svg = selection
            .append("svg")
            .attr("width", __.width)
            .attr("height", __.height)
            .append("svg:g")
            .attr("transform", "translate(" + __.margin.left + "," + __.margin.top + ")");

        return pc;
    };
    var events = d3.dispatch.apply(this,["render", "resize", "highlight", "brush", "brushend", "axesreorder"].concat(d3.keys(__))),
        w = function() { return __.width - __.margin.right - __.margin.left; },
        h = function() { return __.height - __.margin.top - __.margin.bottom; },
        flags = {
            brushable: false,
            reorderable: false,
            axes: false,
            interactive: false,
            shadows: false,
            debug: false
        },
        xscale = d3.scale.ordinal(),
        yscale = {},
        dragging = {},
        line = d3.svg.line(),
        axis = d3.svg.axis().orient("left").ticks(5),
        haxis = d3.svg.axis().orient("bottom"),
        g, // groups for axes, brushes
        ctx = {},
        canvas = {},
        clusterCentroids = [];

// side effects for setters
    var side_effects = d3.dispatch.apply(this,d3.keys(__))
        .on("composite", function(d) { ctx.foreground.globalCompositeOperation = d.value; })
        .on("alpha", function(d) { ctx.foreground.globalAlpha = d.value; })
        .on("width", function(d) { pc.resize(); })
        .on("height", function(d) { pc.resize(); })
        .on("margin", function(d) { pc.resize(); })
        .on("rate", function(d) { rqueue.rate(d.value); })
        .on("data", function(d) {
            if (flags.shadows){paths(__.data, ctx.shadows);}
        })
        .on("dimensions", function(d) {
            xscale.domain(__.dimensions);
            if (flags.interactive){pc.render().updateAxes();}
        })
        .on("bundleDimension", function(d) {
            if (!__.dimensions.length) pc.detectDimensions();
            if (!(__.dimensions[0] in yscale)) pc.autoscale();
            if (typeof d.value === "number") {
                if (d.value < __.dimensions.length) {
                    __.bundleDimension = __.dimensions[d.value];
                } else if (d.value < __.hideAxis.length) {
                    __.bundleDimension = __.hideAxis[d.value];
                }
            } else {
                __.bundleDimension = d.value;
            }
            console.log("bundle dimension: ", __.bundleDimension);
            __.clusterCentroids = compute_cluster_centroids(__.bundleDimension);
        })
        .on("hideAxis", function(d) {
            if (!__.dimensions.length) pc.detectDimensions();
            pc.dimensions(without(__.dimensions, d.value));
        });

// expose the state of the chart
    pc.state = __;
    pc.flags = flags;

// create getter/setters
    getset(pc, __, events);

// expose events
    d3.rebind(pc, events, "on");

// tick formatting
    d3.rebind(pc, axis, "ticks", "orient", "tickValues", "tickSubdivide", "tickSize", "tickPadding", "tickFormat");

// getter/setter with event firing
    function getset(obj,state,events)  {
        d3.keys(state).forEach(function(key) {
            obj[key] = function(x) {
                if (!arguments.length) {
                    return state[key];
                }
                var old = state[key];
                state[key] = x;
                side_effects[key].call(pc,{"value": x, "previous": old});
                events[key].call(pc,{"value": x, "previous": old});
                return obj;
            };
        });
    };

    pc.rescale_for_selection = function(new_data) {
        __.data = new_data;
        pc.autoscale();
        pc.render();
        pc.updateAxesScale();
        //uninstall and reinstall the brush to get updated axis limits in "extents"
        if (pc.brushMode() !== "None") {
            var mode = pc.brushMode();
            pc.brushMode("None");
            pc.brushMode(mode);
        }
    };
    function extend(target, source) {
        for (key in source) {
            target[key] = source[key];
        }
        return target;
    };

    function without(arr, item) {
        return arr.filter(function(elem) { return item.indexOf(elem) === -1; });
    };
    pc.autoscale = function() {
        // yscale
        var defaultScales = {
            "date": function(k) {
                return d3.time.scale()
                    .domain(d3.extent(__.data, function(d) {
                        return d[k] ? d[k].getTime() : null;
                    }))
                    .range([h()+1, 1]);
            },
            "number": function(k) {
                var newMin = d3.min(__.data, function(d) { return +d[k]; });
                newMin = parseFloat(parseFloat(newMin).toFixed(2)).toString();
                __.minValues[k] = newMin;

                return d3.scale.linear()
                //.domain(d3.extent(__.data, function(d) { return +d[k]; }))
                    .domain([newMin, d3.max(__.data, function(d) { return +d[k]; })])
                    .range([h()+1, 1]);
            },
            "string": function(k) {
                var counts = {},
                    domain = [];
                //var newMin = d3.min(__.data, function(d) { return +d[k]; }) -10;
                //  newMin = parseFloat(parseFloat(newMin).toFixed(2)).toString();
                //  __.minValues[k] = newMin;

                // Let's get the count for each value so that we can sort the domain based
                // on the number of items for each value.
                __.data.map(function(p) {
                    if (counts[p[k]] === undefined) {
                        counts[p[k]] = 1;
                    } else {
                        counts[p[k]] = counts[p[k]] + 1;
                    }
                });

                domain = Object.getOwnPropertyNames(counts).sort(function(a, b) {
                    return counts[a] - counts[b];
                });
                remove_i = domain.indexOf("");
                if (remove_i > -1)
                    domain.splice(remove_i,1)
                return d3.scale.ordinal()
                    .domain(domain.sort())
                    .rangePoints([h()+1, 1]);
            }
        };

        __.dimensions.forEach(function(k) {
            yscale[k] = defaultScales[__.types[k]](k);
        });

        __.hideAxis.forEach(function(k) {
            yscale[k] = defaultScales[__.types[k]](k);
        });

        /*// hack to remove ordinal dimensions with many values
        pc.dimensions(pc.dimensions().filter(function(p,i) {
          var uniques = yscale[p].domain().length;
          if (__.types[p] == "string" && (uniques > 60 || uniques < 2)) {
            return false;
          }
          return true;
        }));*/

        // xscale
        xscale.rangePoints([0, w()], 1);

        // canvas sizes
        pc.selection.selectAll("canvas")
            .style("margin-top", __.margin.top + "px")
            .style("margin-left", __.margin.left + "px")
            .attr("width", w()+2)
            .attr("height", h()+(+__.missingAxisOffset));

        // default styles, needs to be set when canvas width changes
        ctx.foreground.strokeStyle = __.color;
        ctx.foreground.lineWidth = 2;
        ctx.foreground.globalCompositeOperation = __.composite;
        ctx.foreground.globalAlpha = __.alpha;
        ctx.highlight.lineWidth = 3;
        ctx.shadows.strokeStyle = "#dadada";

        return this;
    };

    pc.scale = function(d, domain) {
        yscale[d].domain(domain);

        return this;
    };

    pc.flip = function(d) {
        //yscale[d].domain().reverse();					// does not work
        console.log("flipping range: ", yscale[d].domain())
        yscale[d].domain(yscale[d].domain().reverse()); // works

        return this;
    };

    pc.commonScale = function(global, type) {
        var t = type || "number";
        if (typeof global === 'undefined') {
            global = true;
        }

        // scales of the same type
        var scales = __.dimensions.concat(__.hideAxis).filter(function(p) {
            return __.types[p] == t;
        });

        if (global) {
            var extent = d3.extent(scales.map(function(p,i) {
                return yscale[p].domain();
            }).reduce(function(a,b) {
                return a.concat(b);
            }));

            scales.forEach(function(d) {
                yscale[d].domain(extent);
            });

        } else {
            scales.forEach(function(k) {
                yscale[k].domain(d3.extent(__.data, function(d) { return +d[k]; }));
            });
        }

        // update centroids
        if (__.bundleDimension !== null) {
            pc.bundleDimension(__.bundleDimension);
        }

        return this;
    };pc.detectDimensions = function() {
        pc.types(pc.detectDimensionTypes(__.data));
        pc.dimensions(d3.keys(pc.types()));
        return this;
    };

// a better "typeof" from this post: http://stackoverflow.com/questions/7390426/better-way-to-get-type-of-a-javascript-variable
    pc.toType = function(v) {
        return ({}).toString.call(v).match(/\s([a-zA-Z]+)/)[1].toLowerCase();
    };

// try to coerce to number before returning type
    pc.toTypeCoerceNumbers = function(v) {
        if ((parseFloat(v) == v) && (v != null)) {
            return "number";
        }
        return pc.toType(v);
    };

// attempt to determine types of each dimension based on first non empty element in each col
    pc.detectDimensionTypes = function(data) {
        var types = {};
        d3.keys(data[0])
            .forEach(function(col) {
                var column_data = data.map(function (el) {
                    return el[col];
                });
                var first_el = column_data.find(function(el) { return el != "";});
                types[col] = pc.toTypeCoerceNumbers(first_el);
                //types[col] = pc.toTypeCoerceNumbers(data[0][col]);
            });

        return types;
    };
    pc.render = function() {

        // try to autodetect dimensions and create scales
        if (!__.dimensions.length) pc.detectDimensions();
        if (!(__.dimensions[0] in yscale)) pc.autoscale();

        pc.render[__.mode]();

        events.render.call(this);
        return this;
    };

    pc.render['default'] = function() {
        pc.clear('foreground');
        if (__.brushed) {
            __.brushed.forEach(path_foreground);
            __.highlighted.forEach(path_highlight);
        } else {
            __.data.forEach(path_foreground);
            __.highlighted.forEach(path_highlight);
        }
    };

    var rqueue = d3.renderQueue(path_foreground)
        .rate(50)
        .clear(function() {
            pc.clear('foreground');
            pc.clear('highlight');
        });

    pc.render.queue = function() {
        if (__.brushed) {
            rqueue(__.brushed);
            __.highlighted.forEach(path_highlight);
        } else {
            rqueue(__.data);
            __.highlighted.forEach(path_highlight);
        }
    };
    function compute_cluster_centroids(d) {

        var clusterCentroids = d3.map();
        var clusterCounts = d3.map();
        // determine clusterCounts
        __.data.forEach(function(row) {
            var scaled = yscale[d](row[d]);
            if (!clusterCounts.has(scaled)) {
                clusterCounts.set(scaled, 0);
            }
            var count = clusterCounts.get(scaled);
            clusterCounts.set(scaled, count + 1);
        });

        __.data.forEach(function(row) {
            __.dimensions.map(function(p, i) {
                var scaled = yscale[d](row[d]);
                if (!clusterCentroids.has(scaled)) {
                    var map = d3.map();
                    clusterCentroids.set(scaled, map);
                }
                if (!clusterCentroids.get(scaled).has(p)) {
                    clusterCentroids.get(scaled).set(p, 0);
                }
                var value = clusterCentroids.get(scaled).get(p);
                value += yscale[p](row[p]) / clusterCounts.get(scaled);
                clusterCentroids.get(scaled).set(p, value);
            });
        });

        return clusterCentroids;

    }

    function compute_centroids(row) {
        var centroids = [];

        var p = __.dimensions;
        var cols = p.length;
        var a = 0.5;			// center between axes
        for (var i = 0; i < cols; ++i) {
            // centroids on 'real' axes
            var x = position(p[i]);
            var y;// = yscale[p[i]](row[p[i]]);
            if (pc.value_exists(row[p[i]])) {
                y = yscale[p[i]](row[p[i]]);
            } else {
                y = h();
            }
            centroids.push([x, y]);
            //centroids.push($V([x, y]));
            // TO DO: change to include check for value_exists?
            // centroids on 'virtual' axes
            if (i < cols - 1) {
                var cx = x + a * (position(p[i+1]) - x);
                var cy = y + a * (yscale[p[i+1]](row[p[i+1]]) - y);
                if (__.bundleDimension !== null) {
                    var leftCentroid = __.clusterCentroids.get(yscale[__.bundleDimension](row[__.bundleDimension])).get(p[i]);
                    var rightCentroid = __.clusterCentroids.get(yscale[__.bundleDimension](row[__.bundleDimension])).get(p[i+1]);
                    var centroid = 0.5 * (leftCentroid + rightCentroid);
                    cy = centroid + (1 - __.bundlingStrength) * (cy - centroid);
                }
                centroids.push([cx, cy]);
                //centroids.push($V([cx, cy]));
            }
        }

        return centroids;
    }

    pc.compute_centroids = compute_centroids;

    function compute_control_points(centroids) {

        var cols = centroids.length;
        var a = __.smoothness;
        var cps = [];

        cps.push(centroids[0]);
        cps.push($V([centroids[0].e(1) + a*2*(centroids[1].e(1)-centroids[0].e(1)), centroids[0].e(2)]));
        for (var col = 1; col < cols - 1; ++col) {
            var mid = centroids[col];
            var left = centroids[col - 1];
            var right = centroids[col + 1];

            var diff = left.subtract(right);
            cps.push(mid.add(diff.x(a)));
            cps.push(mid);
            cps.push(mid.subtract(diff.x(a)));
        }
        cps.push($V([centroids[cols-1].e(1) + a*2*(centroids[cols-2].e(1)-centroids[cols-1].e(1)), centroids[cols-1].e(2)]));
        cps.push(centroids[cols - 1]);

        return cps;

    };pc.shadows = function() {
        flags.shadows = true;
        if (__.data.length > 0) {
            paths(__.data, ctx.shadows);
        }
        return this;
    };

// draw little dots on the axis line where data intersects
    pc.axisDots = function() {
        var ctx = pc.ctx.marks;
        ctx.globalAlpha = d3.min([ 1 / Math.pow(data.length, 1 / 2), 1 ]);
        __.data.forEach(function(d) {
            __.dimensions.map(function(p, i) {
                ctx.fillRect(position(p) - 0.75, yscale[p](d[p]) - 0.75, 1.5, 1.5);
            });
        });
        return this;
    };

// draw single cubic bezier curve
    function single_curve(d, ctx) {

        var centroids = compute_centroids(d);
        var cps = compute_control_points(centroids);

        ctx.moveTo(cps[0].e(1), cps[0].e(2));
        for (var i = 1; i < cps.length; i += 3) {
            if (__.showControlPoints) {
                for (var j = 0; j < 3; j++) {
                    ctx.fillRect(cps[i+j].e(1), cps[i+j].e(2), 2, 2);
                }
            }
            ctx.bezierCurveTo(cps[i].e(1), cps[i].e(2), cps[i+1].e(1), cps[i+1].e(2), cps[i+2].e(1), cps[i+2].e(2));
        }
    };

// draw single polyline
    function color_path(d, i, ctx) {
        ctx.strokeStyle = d3.functor(__.color)(d, i);
        ctx.beginPath();
        if (__.bundleDimension === null || (__.bundlingStrength === 0 && __.smoothness == 0)) {
            single_path(d, ctx);
        } else {
            single_curve(d, ctx);
        }
        ctx.stroke();
    };

// draw many polylines of the same color
    function paths(data, ctx) {
        ctx.clearRect(-1, -1, w() + 2, h() + (+__.missingAxisOffset));
        ctx.beginPath();
        data.forEach(function(d) {
            if (__.bundleDimension === null || (__.bundlingStrength === 0 && __.smoothness == 0)) {
                single_path(d, ctx);
            } else {
                single_curve(d, ctx);
            }
        });
        ctx.stroke();
    };

    function single_path(d, ctx) {
        //var arrMin = d3.min(__.data);
        __.dimensions.map(function(p, i) {
            var yval;
            if (pc.value_exists(d[p])) {
                yval = yscale[p](d[p]);
            } else {
                //  console.log("in single_path: ", p, __.minValues[p]);
                //    d[p] = __.minValues[p];
                yval = h()+(__.missingAxisOffset-1);
            }
            if (i == 0) {
                ctx.moveTo(position(p), yval);//yscale[p](d[p]));
            } else {
                ctx.lineTo(position(p), yval);//yscale[p](d[p]));
            }
        });
    }

    function path_foreground(d, i) {
        return color_path(d, i, ctx.foreground);
    };

    function path_highlight(d, i) {
        return color_path(d, i, ctx.highlight);
    };
    pc.clear = function(layer) {
        ctx[layer].clearRect(0,0,w()+2,h()+(+__.missingAxisOffset));
        return this;
    };

//where is i coming from? it is always the original i of the dimension (as it was upon creation)? how can it be updated when reordering?
    function flipAxisAndUpdatePCP(dimension, i) {
        var g = pc.svg.selectAll(".dimension");

        pc.flip(dimension);
        i = __.dimensions.indexOf(dimension);
        d3.select(g[0][i])
            .transition()
            .duration(1100)
            .call(axis.scale(yscale[dimension]));
        brushUpdated(brush.modes[brush.mode].selected());
        pc.render();
        if (flags.shadows) paths(__.data, ctx.shadows);
    }

    function update_dim_order(i,j) {
        var tmp = __.reorder_dim[i];
        __.reorder_dim[i] = __.reorder_dim[j];
        __.reorder_dim[j] = tmp;
    }

    function wrap(text) {
        var dim = d3.selectAll("g.dimension");
        var x0 = dim[0][0].getAttribute("transform").match(/\(.*\)/g)[0];
        var x1 = dim[0][1].getAttribute("transform").match(/\(.*\)/g)[0];

        var pxWidth = x1.substring(1, x1.length-1) - x0.substring(1, x0.length-1) - __.deltaPx;
        text.each(function() {
            var text = d3.select(this),
                words = text.text().split(/\s+/).reverse(),
                word,
                line = [],
                lineNumber = 0,
                lineHeight = 1.1, // ems
                y = text.attr("y"),
                dy = parseFloat(text.attr("dy")) || 0,
                tspan = text.text(null).append("tspan").attr("x", 0).attr("y", y).attr("dy", dy + "em");
            while (word = words.pop()) {
                line.push(word);
                tspan.text(line.join(" "));
                //if (tspan.node().getComputedTextLength() > width) { //this returns 0
                //compute by pixel length, which we get from g.dimension width calc
                if (tspan.text().width() > pxWidth) {
                    line.pop();
                    tspan.text(line.join(" "));
                    line = [word];
                    tspan = text.append("tspan").attr("x", 0).attr("y", y).attr("dy", ++lineNumber * lineHeight + dy + "em").text(word);
                }
            }
        });
    }

    String.prototype.width = function(font) {
        var f = font || __.wrapFont,
            o = $j('<div>' + this + '</div>')
                .css({'position': 'absolute', 'float': 'left', 'white-space': 'nowrap', 'visibility': 'hidden', 'font': f})
                .appendTo($('body')),
            w = o.width();

        o.remove();

        return w;
    };

    function rotateLabels() {
        var delta = d3.event.deltaY;
        delta = delta < 0 ? -5 : delta;
        delta = delta > 0 ? 5 : delta;

        __.dimensionTitleRotation += delta;
        //pc.svg.selectAll("text.label")
        pc.svg.selectAll(".label")
        //  .attr("transform", "translate(0,0) rotate(" + __.dimensionTitleRotation + ")");
        //no need to translate again
            .attr("transform", "translate("+__.x_translate+","+__.y_translate +") " +
                //"rotate(" + __.dimensionTitleRotation + "," +__.x_translate/2 + "," +__.y_translate/2 + ")");
                "rotate(" + __.dimensionTitleRotation + ")");
        d3.event.preventDefault();
    }

    function reduceOrdinalLabels(d, sel) {
        var axis = d3.svg.axis().orient("left").ticks(5);
        if (typeof(yscale[d].rangePoints) === 'function') {
            d3.select(sel).call(axis.scale(yscale[d]).tickValues(yscale[d].domain().filter(function(e,i){
                return !(i% Math.ceil(yscale[d].domain().length /__.maxOrdinalTicks) );
            } )));
        } else if (typeof(yscale[d].rangePoints) === 'undefined') {
            d3.select(sel).call(axis.scale(yscale[d]));
        }
    }

    pc.createAxes = function() {
        if (g) pc.removeAxes();

        // Add a group element for each dimension.
        g = pc.svg.selectAll(".dimension")
            .data(__.dimensions, function(d) { return d; })
            .enter().append("svg:g")
            .attr("class", "dimension")
            .attr("transform", function(d) { return "translate(" + xscale(d) + ")"; });

        // Add an axis and title.
        g.append("svg:g")
            .attr("class", "axis")
            .attr("transform", "translate(0,0)")
            .each(function(d) { reduceOrdinalLabels(d, this);})
            .append("svg:text")
            .attr("transform", "translate("+__.x_translate+","+__.y_translate +") rotate(" + __.dimensionTitleRotation + ")")
            .text(function(d) {
                return d in __.dimensionTitles ? __.dimensionTitles[d] : d;  // dimension display names
            })
            .attr({
                "text-anchor": "middle",
                "y": 0,
                "x": 0,
                "dy": 0,
                //"transform": "translate("+__.x_translate+","+__.y_translate +") rotate(" + __.dimensionTitleRotation + ")",
                "class": "label"
            })
            .style("cursor", "all-scroll")
            .call(wrap)
            // .each(function(d){
            //     d3plus.textwrap()
            //         .height(120)
            //         .width(50)
            //         .container(d3.select(this))
            //         //.rotate(-90)
            //         .align("middle")
            //         .draw()
            // })
            .attr("transform", "translate("+__.x_translate+","+__.y_translate +") rotate(" + __.dimensionTitleRotation + ")")

            .on("dblclick", flipAxisAndUpdatePCP)
            .on("wheel", rotateLabels);

        //d3.selectAll("text.label").call(wrap, 10);
        g.selectAll("text").append("title").text("Scroll to rotate / drag to reorder / click to color by values / double click to invert");

        //create scale for missing values axis
        var firstPC_Xoffset = xscale(__.dimensions[0]);
        haxisScale = d3.scale.linear()
            .domain([0, __.dimensions.length])
            .range([0 , xscale(__.dimensions[__.dimensions.length -1]) - firstPC_Xoffset ]);

        pc.svg.append("svg:g") //g element to group missing values related elements
            .attr("transform", "translate(0," + ( (+h())+(+__.missingAxisOffset) ) + ")")//XXX TO DO: generalize this
            .append("svg:g")   //g element for the axis itself
            .attr("id","haxis")
            .attr("class", "axis") //this will give it the same CSS properties as the vertical axes
            .attr("transform",  "translate("+firstPC_Xoffset +")")
            //.call(haxis.scale(haxisScale).tickFormat(""))  //no tick labels
            .call(haxis.scale(haxisScale).tickValues([]))  //no ticks and no tick labels
            .append("svg:text")
            .attr("transform","translate(-"+(+firstPC_Xoffset-1)+", -10)")
            .text("Missing Values");



        flags.axes= true;
        __.reorder_dim = d3.range(__.dimensions.length);
        return this;
    };

    pc.get_reorderDim_i = function (i) {
        return __.reorder_dim[i];
    };
    pc.get_missingVOffset = function () {
        return __.missingAxisOffset;
    }
    pc.value_exists = function(v) {
        if ( (v === undefined) || (v == "NaN")  || (v == "") ) {
            return false;
        } else {
            return true;
        }
    }
    pc.removeAxes = function() {
        g.remove();
        return this;
    };

    pc.updateAxesScale = function() {
        pc.svg.selectAll(".axis:not(#haxis)")
            .transition()
            .duration(1100)
            .each(function(d) { reduceOrdinalLabels(d, this);});
    };

    /* This function is never used? the wrap call does not work, not clear why.
    * */
    pc.updateAxes = function() {
        var g_data = pc.svg.selectAll(".dimension").data(__.dimensions);

        // Enter
        g_data.enter().append("svg:g")
            .attr("class", "dimension")
            .attr("transform", function(p) { return "translate(" + position(p) + ")"; })
            .style("opacity", 0)
            .append("svg:g")
            .attr("class", "axis")
            .attr("transform", "translate(0,0)")
            .each(function(d) { reduceOrdinalLabels(d, this);})
            .append("svg:text")
            .attr("transform", "translate("+__.x_translate+","+__.y_translate +") rotate(" + __.dimensionTitleRotation + ")")
            .text(String)
            .attr({
                "text-anchor": "middle",
                "x": 0,
                "y": 0,
                "dy": 0,
//        "transform": "translate("+__.x_translate+","+__.y_translate +")) rotate(" + __.dimensionTitleRotation + ")",
                "class": "label"
            })
            .call(wrap)
            .style("cursor", "all-scroll")
            .attr("transform", "translate("+__.x_translate+","+__.y_translate +") rotate(" + __.dimensionTitleRotation + ")")
            .on("dblclick", flipAxisAndUpdatePCP)
            .on("wheel", rotateLabels);


        // Update
        g_data.attr("opacity", 0);
        g_data.select(".axis")
            .transition()
            .duration(1100)
            .each(function(d) { reduceOrdinalLabels(d, this);})

        g_data.select(".label")
            .transition()
            .duration(1100)
            .text(String)
            .attr("transform", "translate("+__.x_translate+","+__.y_translate +") rotate(" + __.dimensionTitleRotation + ")");
        // Exit
        g_data.exit().remove();

        g = pc.svg.selectAll(".dimension");
        g.transition().duration(1100)
            .attr("transform", function(p) { return "translate(" + position(p) + ")"; })
            .style("opacity", 1);

        // rescale all but the horizontal 'Missing Values' axis
        pc.svg.selectAll(".axis:not(#haxis)")
            .transition()
            .duration(1100)
            .each(function(d) { reduceOrdinalLabels(d, this);})
        //pc.svg.selectAll(".label").call(wrap);

        if (flags.shadows) paths(__.data, ctx.shadows);
        if (flags.brushable) pc.brushable();
        if (flags.reorderable) pc.reorderable();
        if (pc.brushMode() !== "None") {
            var mode = pc.brushMode();
            pc.brushMode("None");
            pc.brushMode(mode);
        }
        return this;
    };

// Jason Davies, http://bl.ocks.org/1341281
    pc.reorderable = function() {
        if (!g) pc.createAxes();

        // Keep track of the order of the axes to verify if the order has actually
        // changed after a drag ends. Changed order might have consequence (e.g.
        // strums that need to be reset).
        var dimsAtDragstart;

        g.style("cursor", "move")
            .call(d3.behavior.drag()
                .on("dragstart", function(d) {
                    dragging[d] = this.__origin__ = xscale(d);
                    dimsAtDragstart = __.dimensions.slice();
                    //orig_i = dimsAtDragstart.indexOf(d);
                })
                .on("drag", function(d) {
                    dragging[d] = Math.min(w(), Math.max(0, this.__origin__ += d3.event.dx));
                    __.dimensions.sort(function(a, b) { return position(a) - position(b); });
                    xscale.domain(__.dimensions);
                    pc.render();
                    g.attr("transform", function(d) { return "translate(" + position(d) + ")"; });
                })
                .on("dragend", function(d, i) {
                    // Let's see if the order has changed and send out an event if so.
                    var j = __.dimensions.indexOf(d),
                        parent = this.parentElement,
                        orig_i = dimsAtDragstart.indexOf(d);
                    //console.log("i, orig_i, j: ",i, orig_i, j) //for debugging
                    if (orig_i !== j) {
                        events.axesreorder.call(pc, __.dimensions);
                        // We now also want to reorder the actual dom elements that represent
                        // the axes. That is, the g.dimension elements. If we don't do this,
                        // we get a weird and confusing transition when updateAxes is called.
                        // This is due to the fact that, initially the nth g.dimension element
                        // represents the nth axis. However, after a manual reordering,
                        // without reordering the dom elements, the nth dom elements no longer
                        // necessarily represents the nth axis.
                        //
                        // i is the original index of the dom element? Update: does not work when switching dim back and forth
                        // orig_i is the original index from drag start.
                        // j is the new index of the dom element

                        if (orig_i <= j) {
                            for (var k=orig_i; k<j; k++) {
                                update_dim_order(k, k+1);
                            }
                            parent.insertBefore(this, parent.children[j + 1]);
                        } else {
                            for (var k=orig_i; k>j; k--) {
                                update_dim_order(k-1, k);
                            }
                            parent.insertBefore(this, parent.children[j]);

                        }
                        //console.log("reorder_dim: ", __.reorder_dim) //for debugging

                    }

                    //var g = pc.svg.selectAll(".dimension");
                    delete this.__origin__;
                    delete dragging[d];
                    d3.select(this).transition().attr("transform", "translate(" + xscale(d) + ")");
                    pc.render();
                    if (flags.shadows) paths(__.data, ctx.shadows);
                }));
        flags.reorderable = true;
        return this;
    };

// pairs of adjacent dimensions
    pc.adjacent_pairs = function(arr) {
        var ret = [];
        for (var i = 0; i < arr.length-1; i++) {
            ret.push([arr[i],arr[i+1]]);
        };
        return ret;
    };

    var brush = {
        modes: {
            "None": {
                install: function(pc) {},           // Nothing to be done.
                uninstall: function(pc) {},         // Nothing to be done.
                selected: function() { return []; } // Nothing to return
            }
        },
        mode: "None",
        predicate: "ALL",
        currentMode: function() {
            return this.modes[this.mode];
        }
    };

// This function can be used for 'live' updates of brushes. That is, during the
// specification of a brush, this method can be called to update the view.
//
// @param newSelection - The new set of data items that is currently contained
//                       by the brushes
    function brushUpdated(newSelection) {
        __.brushed = newSelection;
        events.brush.call(pc,__.brushed);
        pc.render();
    }

    function brushPredicate(predicate) {
        if (!arguments.length) { return brush.predicate; }

        predicate = String(predicate).toUpperCase();
        if (predicate !== "ALL" && predicate !== "ANY") {
            throw "Invalid predicate " + predicate;
        }

        brush.predicate = predicate;
        __.brushed = brush.currentMode().selected();
        pc.render();
        return pc;
    }

    pc.brushModes = function() {
        return Object.getOwnPropertyNames(brush.modes);
    };

    pc.brushMode = function(mode) {
        if (arguments.length === 0) {
            return brush.mode;
        }

        if (pc.brushModes().indexOf(mode) === -1) {
            throw "pc.brushmode: Unsupported brush mode: " + mode;
        }

        // Make sure that we don't trigger unnecessary events by checking if the mode
        // actually changes.
        if (mode !== brush.mode) {
            // When changing brush modes, the first thing we need to do is clearing any
            // brushes from the current mode, if any.
            if (brush.mode !== "None") {
                pc.brushReset();
            }

            // Next, we need to 'uninstall' the current brushMode.
            brush.modes[brush.mode].uninstall(pc);
            // Finally, we can install the requested one.
            brush.mode = mode;
            brush.modes[brush.mode].install();
            if (mode === "None") {
                delete pc.brushPredicate;
            } else {
                pc.brushPredicate = brushPredicate;
            }
        }

        return pc;
    };

// brush mode: 1D-range

    (function() {
        var brushes = {};

        function is_brushed(p) {
            return !brushes[p].empty();
        }

        // data within extents
        function selected() {
            var actives = __.dimensions.filter(is_brushed),
                extents = actives.map(function(p) { return brushes[p].extent(); });

            // We don't want to return the full data set when there are no axes brushed.
            // Actually, when there are no axes brushed, by definition, no items are
            // selected. So, let's avoid the filtering and just return false.
            //if (actives.length === 0) return false;

            // Resolves broken examples for now. They expect to get the full dataset back from empty brushes
            if (actives.length === 0) return __.data;

            // test if within range
            var within = {
                "date": function(d,p,dimension) {
                    return extents[dimension][0] <= d[p] && d[p] <= extents[dimension][1];
                },
                "number": function(d,p,dimension) {
                    return extents[dimension][0] <= d[p] && d[p] <= extents[dimension][1];
                },
                "string": function(d,p,dimension) {
                    return extents[dimension][0] <= yscale[p](d[p]) && yscale[p](d[p]) <= extents[dimension][1];
                }
            };

            return __.data
                .filter(function(d) {
                    switch(brush.predicate) {
                        case "ALL":
                            return actives.every(function(p, dimension) {
                                return within[__.types[p]](d,p,dimension);
                            });
                        case "ANY":
                            return actives.some(function(p, dimension) {
                                return within[__.types[p]](d,p,dimension);
                            });
                        default:
                            throw "Unknown brush predicate " + __.brushPredicate;
                    }
                });
        };

        function brushExtents() {
            var extents = {};
            __.dimensions.forEach(function(d) {
                var brush = brushes[d];
                if (!brush.empty()) {
                    var extent = brush.extent();
                    extent.sort(d3.ascending);
                    extents[d] = extent;
                }
            });
            return extents;
        }

        function brushFor(axis) {
            var brush = d3.svg.brush();

            brush
                .y(yscale[axis])
                .on("brushstart", function() { d3.event.sourceEvent.stopPropagation(); })
                .on("brush", function() {
                    brushUpdated(selected());
                })
                .on("brushend", function() {
                    events.brushend.call(pc, __.brushed);
                });

            brushes[axis] = brush;
            return brush;
        }

        function brushReset(dimension) {
            __.brushed = false;
            if (g) {
                g.selectAll('.brush')
                    .each(function(d) {
                        d3.select(this).call(
                            brushes[d].clear()
                        );
                    });
                pc.render();
            }
            return this;
        };

        function install() {
            if (!g) pc.createAxes();

            // Add and store a brush for each axis.
            g.append("svg:g")
                .attr("class", "brush")
                .each(function(d) {
                    d3.select(this).call(brushFor(d));
                })
                .selectAll("rect")
                .style("visibility", null)
                .attr("x", -15)
                .attr("width", 30);

            pc.brushExtents = brushExtents;
            pc.brushReset = brushReset;
            return pc;
        }

        brush.modes["Single range"] = {
            install: install,
            uninstall: function() {
                g.selectAll(".brush").remove();
                brushes = {};
                delete pc.brushExtents;
                delete pc.brushReset;
            },
            selected: selected
        };
    })();
// // brush mode: 2D-strums
// // bl.ocks.org/syntagmatic/5441022
//
// (function() {
//   var strums = {},
//       strumRect;
//
//   function drawStrum(strum, activePoint) {
//     var offset_x = 0;
//     var svg = pc.selection.select("svg").select("g#strums"),
//         id = strum.dims.i,
//         points = [strum.p1, strum.p2],
//         line = svg.selectAll("line#strum-" + id).data([strum]),
//         circles = svg.selectAll("circle#strum-" + id).data(points),
//         drag = d3.behavior.drag();
//     console.log(strum.p1, strum.p2);
//     line.enter()
//       .append("line")
//       .attr("id", "strum-" + id)
//       .attr("class", "strum");
//
//     line
//       .attr("x1", function(d) { console.log(d); return d.p1[0]-offset_x; })
//       .attr("y1", function(d) { return d.p1[1]; })
//       .attr("x2", function(d) { return d.p2[0]-offset_x; })
//       .attr("y2", function(d) { return d.p2[1]; })
//       .attr("stroke", "black")
//       .attr("stroke-width", 2);
//
//     drag
//       .on("drag", function(d, i) {
//         var ev = d3.event;
//         i = i + 1;
//         strum["p" + i][0] = Math.min(Math.max(strum.minX + 1, ev.x), strum.maxX);
//         strum["p" + i][1] = Math.min(Math.max(strum.minY, ev.y), strum.maxY);
//         drawStrum(strum, i - 1);
//       })
//       .on("dragend", onDragEnd());
//
//     circles.enter()
//       .append("circle")
//       .attr("id", "strum-" + id)
//       .attr("class", "strum");
//
//     circles
//       .attr("cx", function(d) { return d[0]-offset_x; })
//       .attr("cy", function(d) { return d[1]; })
//       .attr("r", 5)
//       .style("opacity", function(d, i) {
//         return (activePoint !== undefined && i === activePoint) ? 0.8 : 0;
//       })
//       .on("mouseover", function() {
//         d3.select(this).style("opacity", 0.8);
//       })
//       .on("mouseout", function() {
//         d3.select(this).style("opacity", 0);
//       })
//       .call(drag);
//   }
//
//   function dimensionsForPoint(p) {
//     var dims = { i: -1, left: undefined, right: undefined };
//     __.dimensions.some(function(dim, i) {
//       if (xscale(dim) < p[0]) {
//         var next = __.dimensions[i + 1];
//         dims.i = i;
//         dims.left = dim;
//         dims.right = next;
//         return false;
//       }
//       return true;
//     });
//
//     if (dims.left === undefined) {
//       // Event on the left side of the first axis.
//       dims.i = 0;
//       dims.left = __.dimensions[0];
//       dims.right = __.dimensions[1];
//     } else if (dims.right === undefined) {
//       // Event on the right side of the last axis
//       dims.i = __.dimensions.length - 1;
//       dims.right = dims.left;
//       dims.left = __.dimensions[__.dimensions.length - 2];
//     }
//
//     return dims;
//   }
//
//   function onDragStart() {
//     // First we need to determine between which two axes the sturm was started.
//     // This will determine the freedom of movement, because a strum can
//     // logically only happen between two axes, so no movement outside these axes
//     // should be allowed.
//     return function() {
//       var p = d3.mouse(strumRect[0][0]),
//           dims = dimensionsForPoint(p),
//           strum = {
//             p1: p,
//             dims: dims,
//             minX: xscale(dims.left),
//             maxX: xscale(dims.right),
//             minY: 0,
//             maxY: h()
//           };
//
//       strums[dims.i] = strum;
//       strums.active = dims.i;
//
//       // Make sure that the point is within the bounds
//       strum.p1[0] = Math.min(Math.max(strum.minX, p[0]), strum.maxX);
//       strum.p1[1] = p[1] - __.margin.top;
//       strum.p2 = strum.p1.slice();
//     };
//   }
//
//   function onDrag() {
//     return function() {
//       var ev = d3.event,
//           strum = strums[strums.active];
//
//       // Make sure that the point is within the bounds
//       strum.p2[0] = Math.min(Math.max(strum.minX + 1, ev.x), strum.maxX);
//       strum.p2[1] = Math.min(Math.max(strum.minY, ev.y - __.margin.top), strum.maxY);
//       drawStrum(strum, 1);
//     };
//   }
//
//   function containmentTest(strum, width) {
//     var p1 = [strum.p1[0] - strum.minX, strum.p1[1] - strum.minX],
//         p2 = [strum.p2[0] - strum.minX, strum.p2[1] - strum.minX],
//         m1 = 1 - width / p1[0],
//         b1 = p1[1] * (1 - m1),
//         m2 = 1 - width / p2[0],
//         b2 = p2[1] * (1 - m2);
//
//     // test if point falls between lines
//     return function(p) {
//       var x = p[0],
//           y = p[1],
//           y1 = m1 * x + b1,
//           y2 = m2 * x + b2;
//
//       if (y > Math.min(y1, y2) && y < Math.max(y1, y2)) {
//         return true;
//       }
//
//       return false;
//     };
//   }
//
//   function selected() {
//     var ids = Object.getOwnPropertyNames(strums),
//         brushed = __.data;
//
//     // Get the ids of the currently active strums.
//     ids = ids.filter(function(d) {
//       return !isNaN(d);
//     });
//
//     function crossesStrum(d, id) {
//       var strum = strums[id],
//           test = containmentTest(strum, strums.width(id)),
//           d1 = strum.dims.left,
//           d2 = strum.dims.right,
//           y1 = yscale[d1],
//           y2 = yscale[d2],
//           point = [y1(d[d1]) - strum.minX, y2(d[d2]) - strum.minX];
//       return test(point);
//     }
//
//     if (ids.length === 0) { return brushed; }
//
//     return brushed.filter(function(d) {
//       switch(brush.predicate) {
//       case "ALL":
//         return ids.every(function(id) { return crossesStrum(d, id); });
//       case "ANY":
//         return ids.some(function(id) { return crossesStrum(d, id); });
//       default:
//         throw "Unknown brush predicate " + __.brushPredicate;
//       }
//     });
//   }
//
//   function removeStrum() {
//     var strum = strums[strums.active],
//         svg = pc.selection.select("svg").select("g#strums");
//
//     delete strums[strums.active];
//     strums.active = undefined;
//     svg.selectAll("line#strum-" + strum.dims.i).remove();
//     svg.selectAll("circle#strum-" + strum.dims.i).remove();
//   }
//
//   function onDragEnd() {
//     return function() {
//       var brushed = __.data,
//           strum = strums[strums.active];
//
//       // Okay, somewhat unexpected, but not totally unsurprising, a mousclick is
//       // considered a drag without move. So we have to deal with that case
//       if (strum && strum.p1[0] === strum.p2[0] && strum.p1[1] === strum.p2[1]) {
//         removeStrum(strums);
//       }
//
//       brushed = selected(strums);
//       strums.active = undefined;
//       __.brushed = brushed;
//       pc.render();
//       events.brushend.call(pc, __.brushed);
//     };
//   }
//
//   function brushReset(strums) {
//     return function() {
//       var ids = Object.getOwnPropertyNames(strums).filter(function(d) {
//         return !isNaN(d);
//       });
//
//       ids.forEach(function(d) {
//         strums.active = d;
//         removeStrum(strums);
//       });
//       onDragEnd(strums)();
//     };
//   }
//
//   function install() {
//     var drag = d3.behavior.drag();
//
//     // Map of current strums. Strums are stored per segment of the PC. A segment,
//     // being the area between two axes. The left most area is indexed at 0.
//     strums.active = undefined;
//     // Returns the width of the PC segment where currently a strum is being
//     // placed. NOTE: even though they are evenly spaced in our current
//     // implementation, we keep for when non-even spaced segments are supported as
//     // well.
//     strums.width = function(id) {
//       var strum = strums[id];
//
//       if (strum === undefined) {
//         return undefined;
//       }
//
//       return strum.maxX - strum.minX;
//     };
//
//     pc.on("axesreorder.strums", function() {
//       var ids = Object.getOwnPropertyNames(strums).filter(function(d) {
//         return !isNaN(d);
//       });
//
//       // Checks if the first dimension is directly left of the second dimension.
//       function consecutive(first, second) {
//         var length = __.dimensions.length;
//         return __.dimensions.some(function(d, i) {
//           return (d === first)
//             ? i + i < length && __.dimensions[i + 1] === second
//             : false;
//         });
//       }
//
//       if (ids.length > 0) { // We have some strums, which might need to be removed.
//         ids.forEach(function(d) {
//           var dims = strums[d].dims;
//           strums.active = d;
//           // If the two dimensions of the current strum are not next to each other
//           // any more, than we'll need to remove the strum. Otherwise we keep it.
//           if (!consecutive(dims.left, dims.right)) {
//             removeStrum(strums);
//           }
//         });
//         onDragEnd(strums)();
//       }
//     });
//
//     // Add a new svg group in which we draw the strums.
//     pc.selection.select("svg").append("g")
//       .attr("id", "strums")
//       .attr("transform", "translate(" + __.margin.left + "," + __.margin.top + ")");
//
//     // Install the required brushReset function
//     pc.brushReset = brushReset(strums);
//
//     drag
//       .on("dragstart", onDragStart(strums))
//       .on("drag", onDrag(strums))
//       .on("dragend", onDragEnd(strums));
//
//     // NOTE: The styling needs to be done here and not in the css. This is because
//     //       for 1D brushing, the canvas layers should not listen to
//     //       pointer-events.
//     strumRect = pc.selection.select("svg").insert("rect", "g#strums")
//       .attr("id", "strum-events")
//       .attr("x", __.margin.left)
//       .attr("y", __.margin.top)
//       .attr("width", w())
//       .attr("height", h() + 2)
//       .style("opacity", 0)
//       .call(drag);
//   }
//
//   brush.modes["2D-strums"] = {
//     install: install,
//     uninstall: function() {
//       pc.selection.select("svg").select("g#strums").remove();
//       pc.selection.select("svg").select("rect#strum-events").remove();
//       pc.on("axesreorder.strums", undefined);
//       delete pc.brushReset;
//
//       strumRect = undefined;
//     },
//     selected: selected
//   };
//
// }());


// brush mode: 1D-range with multiple extents
// requires d3.svg.multibrush

    (function() {
        if (typeof d3.svg.multibrush !== 'function') {
            return;
        }
        var brushes = {};

        function is_brushed(p) {
            return !brushes[p].empty();
        }

        // data within extents
        function selected() {
            var actives = __.dimensions.filter(is_brushed),
                extents = actives.map(function(p) { return brushes[p].extent(); });

            // We don't want to return the full data set when there are no axes brushed.
            // Actually, when there are no axes brushed, by definition, no items are
            // selected. So, let's avoid the filtering and just return false.
            //if (actives.length === 0) return false;

            // Resolves broken examples for now. They expect to get the full dataset back from empty brushes
            if (actives.length === 0) return __.data;

            // test if within range
            var within = {
                "date": function(d,p,dimension,b) {
                    return b[0] <= d[p] && d[p] <= b[1];
                },

                "number": function(d,p,dimension,b) {
                    return b[0] <= d[p] && d[p] <= b[1];
                },
                "string": function(d,p,dimension,b) {
                    return b[0] <= yscale[p](d[p]) && yscale[p](d[p]) <= b[1];
                }
            };

            return __.data
                .filter(function(d) {
                    switch(brush.predicate) {
                        case "ALL":
                            return actives.every(function(p, dimension) {
                                return extents[dimension].some(function(b) {
                                    return within[__.types[p]](d,p,dimension,b);
                                });
                            });
                        case "ANY":
                            return actives.some(function(p, dimension) {
                                return extents[dimension].some(function(b) {
                                    return within[__.types[p]](d,p,dimension,b);
                                });
                            });
                        default:
                            throw "Unknown brush predicate " + __.brushPredicate;
                    }
                });
        };

        function brushExtents() {
            var extents = {};
            __.dimensions.forEach(function(d) {
                var brush = brushes[d];
                if (brush !== undefined && !brush.empty()) {
                    var extent = brush.extent();
                    extent.sort(d3.ascending);
                    extents[d] = extent;
                }
            });
            return extents;
        }

        function brushFor(axis) {
            var brush = d3.svg.multibrush();

            brush
                .y(yscale[axis])
                //.y(__.dimensions[axis].yscale)
                .on("brushstart", function() {
                    if(d3.event.sourceEvent !== null) {
                        d3.event.sourceEvent.stopPropagation();
                    }
                })
                .on("brush", function() {
                    brushUpdated(selected());
                })
                .on("brushend", function() {
                    // d3.svg.multibrush clears extents just before calling 'brushend'
                    // so we have to update here again.
                    // This fixes issue #103 for now, but should be changed in d3.svg.multibrush
                    // to avoid unnecessary computation.
                    brushUpdated(selected());
                    events.brushend.call(pc, __.brushed);
                })
                .extentAdaption(function(selection) {
                    selection
                        .style("visibility", null)
                        .attr("x", -15)
                        .attr("width", 30);
                })
                .resizeAdaption(function(selection) {
                    selection
                        .selectAll("rect")
                        .attr("x", -15)
                        .attr("width", 30);
                });

            brushes[axis] = brush;
            return brush;
        }

        function brushReset(dimension) {
            __.brushed = false;
            if (g) {
                g.selectAll('.brush')
                    .each(function(d) {
                        d3.select(this).call(
                            brushes[d].clear()
                        );
                    });
                pc.render();
                //pc.renderBrushed();
            }
            return this;
        };

        function install() {
            if (!g) pc.createAxes();

            // Add and store a brush for each axis.
            g.append("svg:g")
                .attr("class", "brush")
                .each(function(d) {
                    d3.select(this).call(brushFor(d));
                })
                .selectAll("rect")
                .style("visibility", null)
                .attr("x", -15)
                .attr("width", 30);

            pc.brushExtents = brushExtents;
            pc.brushReset = brushReset;
            return pc;
        }

        brush.modes["Multiple ranges"] = {
            install: install,
            uninstall: function() {
                g.selectAll(".brush").remove();
                brushes = {};
                delete pc.brushExtents;
                delete pc.brushReset;
            },
            selected: selected,
            brushState: brushExtents
        };
    })();
    pc.interactive = function() {
        flags.interactive = true;
        return this;
    };

// expose a few objects
    pc.xscale = xscale;
    pc.yscale = yscale;
    pc.ctx = ctx;
    pc.canvas = canvas;
    pc.g = function() { return g; };

// rescale for height, width and margins
// TODO currently assumes chart is brushable, and destroys old brushes
    pc.resize = function() {
        // selection size
        pc.selection.select("svg")
            .attr("width", __.width)
            .attr("height", __.height);
        pc.svg.attr("transform", "translate(" + __.margin.left + "," + __.margin.top + ")");

        // FIXME: the current brush state should pass through
        if (flags.brushable) pc.brushReset();

        // scales
        pc.autoscale();

        // axes, destroys old brushes.
        if (g) pc.createAxes();
        if (flags.shadows) paths(__.data, ctx.shadows);
        if (flags.brushable) pc.brushable();
        if (flags.reorderable) pc.reorderable();

        events.resize.call(this, {width: __.width, height: __.height, margin: __.margin});
        return this;
    };

// highlight an array of data
    pc.highlight = function(data) {
        if (arguments.length === 0) {
            return __.highlighted;
        }

        __.highlighted = data;
        pc.clear("highlight");
        d3.select(canvas.foreground).classed("faded", true);
        data.forEach(path_highlight);
        events.highlight.call(this, data);
        return this;
    };

// clear highlighting
    pc.unhighlight = function() {
        __.highlighted = [];
        pc.clear("highlight");
        d3.select(canvas.foreground).classed("faded", false);
        return this;
    };

// calculate 2d intersection of line a->b with line c->d
// points are objects with x and y properties
    pc.intersection =  function(a, b, c, d) {
        return {
            x: ((a.x * b.y - a.y * b.x) * (c.x - d.x) - (a.x - b.x) * (c.x * d.y - c.y * d.x)) / ((a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x)),
            y: ((a.x * b.y - a.y * b.x) * (c.y - d.y) - (a.y - b.y) * (c.x * d.y - c.y * d.x)) / ((a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x))
        };
    };

    function position(d) {
        var v = dragging[d];
        return v == null ? xscale(d) : v;
    }
    pc.version = "0.5.0";
    // this descriptive text should live with other introspective methods
    pc.toString = function() { return "Parallel Coordinates: " + __.dimensions.length + " dimensions (" + d3.keys(__.data[0]).length + " total) , " + __.data.length + " rows"; };

    return pc;
};

d3.renderQueue = (function(func) {
    var _queue = [],                  // data to be rendered
        _rate = 10,                   // number of calls per frame
        _clear = function() {},       // clearing function
        _i = 0;                       // current iteration

    var rq = function(data) {
        if (data) rq.data(data);
        rq.invalidate();
        _clear();
        rq.render();
    };

    rq.render = function() {
        _i = 0;
        var valid = true;
        rq.invalidate = function() { valid = false; };

        function doFrame() {
            if (!valid) return true;
            if (_i > _queue.length) return true;

            // Typical d3 behavior is to pass a data item *and* its index. As the
            // render queue splits the original data set, we'll have to be slightly
            // more carefull about passing the correct index with the data item.
            var end = Math.min(_i + _rate, _queue.length);
            for (var i = _i; i < end; i++) {
                func(_queue[i], i);
            }
            _i += _rate;
        }

        d3.timer(doFrame);
    };

    rq.data = function(data) {
        rq.invalidate();
        _queue = data.slice(0);
        return rq;
    };

    rq.rate = function(value) {
        if (!arguments.length) return _rate;
        _rate = value;
        return rq;
    };

    rq.remaining = function() {
        return _queue.length - _i;
    };

    // clear the canvas
    rq.clear = function(func) {
        if (!arguments.length) {
            _clear();
            return rq;
        }
        _clear = func;
        return rq;
    };

    rq.invalidate = function() {};

    return rq;
});
