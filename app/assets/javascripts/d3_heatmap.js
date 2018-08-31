// For creating d3-tip hovering bubbles
//= require d3-tip
var heatmap_data;

var heatMap = d3.select("#heatmap").selectAll(".col");
var skip_col = ["compound id", "compound"];   //formerly for NMTrypI

function set_heatmap_data(data){
    heatmap_data = data;
}

function update_heatmap(values) {
    var colorScale = d3.scale.quantile()
        .domain(values)
        .range(colors);
    heatMap.style("fill", function (d) {
        return colorScale(d.value);
    });
}

function draw_heatmap(data) {
    set_heatmap_data(data);
    var toRemove = new Array();         //index of cells to remove
    var rows = new Array(),
        cols = new Array(),
        col_alphas = new Array(),
        col_labels = new Array(),       // column titles
        row_labels= new Array();        // row titles
    $j.each(data, function (i, json) {
        //ignore cells with compound id as recorded data/label cells
        if (skip_col.indexOf(json.col_label.toLowerCase()) === -1) {
            $j.each(json, function (key, val) {     //each property in the cell
                if (key === "row" && rows.indexOf(val) === -1) {
                    rows.push(val);
                    row_labels.push(json["row_label"]);
                }
                if (key === "col" && cols.indexOf(val) === -1 && col_labels.indexOf(val) === -1){
                    col_labels.push(json["col_label"]);
                    cols.push(val);
                    col_alphas.push(json["col_alpha"]);
                }
            });
        } else {
            //column is on the skip list. mark cell for deletion if content=row_label (compound ID column)
            if (json.row_label == json.value ) toRemove.push(i);
        }
    });
    for (var i=toRemove.length-1; i>=0; i--) {
        var removed = data.splice(toRemove[i], 1);
    }

    console.log("data: ", data)
    console.log("cols: ", cols);
    console.log("col alphas: ", col_alphas);
    console.log("rows: ", rows);
    console.log("col labels: ", col_labels);
    console.log("row labels: ", row_labels);

    var margin = { top: 25, right: 0, bottom: 100, left: 100 },
        gridSize = 38,
        legendElementWidth = gridSize * 2,
        buckets = 3,
        legendWidth = legendElementWidth * buckets,
        allGridWidth = gridSize * cols.length,
        heatMapWidth = allGridWidth < legendWidth ? legendWidth : allGridWidth,
        heatMapHeight = gridSize * rows.length,
        width = heatMapWidth + margin.left + margin.right,
        height = heatMapHeight + margin.top + margin.bottom;

    //remove old svg
    d3.select("svg.grid")
        .remove();
    origHeight = 0;
    var svg = d3.select("#heatmap").append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .attr("class", "grid")
        .append("g")
        .attr("id", "heatmap_matrix")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ") " + "scale(1,1)");


    //Prints the row labels (from col 0)
    var rowLabels = svg.selectAll(".rowLabel")
        .data(row_labels)
        .enter().append("text")
        .text(function (d) {
            return d;
        })
        .attr("x", 0)
        .attr("y", function (d, i) {
            return (i + 1.5) * gridSize;
        })
        .style("text-anchor", "end")
        .attr("transform", "translate(-6," + gridSize / 1.5 + ")")
        .attr("class", function (d, i) {
            return ((i >= 0 && i <= rows.length) ? "rowLabel mono axis axis-workweek" : "rowLabel mono axis");
        })
        .append("title")
        .text(function(d){
            return  d;
        });
    colLabelRotate = 270;
    var colLabels = svg.selectAll(".colLabel")      //grid col labels ("Col_A", ..)
        .data(col_alphas)
        .enter().append("text")
        .text(function (d) {
            return "Col_" + d; //num2alpha(d+1);    //num2alpha conversion doesn't work with multiple sheets
        })
        .attr("x", function (d, i) {
            return (i) * gridSize;
        })
        .attr("y", 1 * gridSize)

        .style("text-anchor", "middle")
        .attr("transform", function (d, i){
            return "translate(" + gridSize / 2 + ", -6) rotate("+colLabelRotate+","+ (i) * gridSize +"," + 1 * gridSize+ ")";
        })
        //.attr("transform", "translate(" + gridSize / 2 + ", -6)")
        .attr("class", "colLabel mono axis axis-worktime")
        .append("title")
        .text(function(d,i){
            return  "Column "+ d + ": "+col_labels[i];
        });
//        .attr("dy",".78em")
//        .call(wrap, x.rangeBand());

    //former syntax: num2alpha(cols[(i+1)%col_labels.length])
    var tip = d3.tip()
        .attr('class', 'd3-tip')
        .offset([-10, 0])
        .html(function(d){
            return d.row_label + " ", d.col_label
            + " (Sheet " + d.sheet + ", Col_" +  d.col_alpha          //num2alpha(d.col+1) +
            + "): <span style='color:#ff810c'>"
            + d3.format(".2f")(d.value)+ "</span>";
        });
    // svg.selectAll("#heatmap_matrix").call(tip);
    svg.call(tip);
    heatMap = svg.selectAll(".col")
        .data(data)
        .enter().append("rect")
        .attr("x", function (d) {
            return (cols.indexOf(d.col)) * gridSize;
        }) //d.col >0? d.col-1 : 1
        .attr("y", function (d) {
            return (rows.indexOf(d.row) + 1.5) * gridSize;
        })
        .attr("rx", 4)
        .attr("ry", 4)
        .attr("class", "col bordered")
        .attr("width", gridSize)
        .attr("height", gridSize)
        .style("fill", colors[0])
        .on("mouseover", function (d) {
            prevFill = this.style.fill;
            d3.select(this).style("opacity", '0.3').style("fill", "grey");
            tip.show(d);
        })
        .on("mouseout", function (d) {
            d3.select(this).style("opacity",'1.0').style("fill", prevFill);
            tip.hide(d);
        });


    var min =  d3.min(data, function (d) {
        return Math.floor(parseFloat(d.value));
    }) -1;
    var max = d3.max(data, function (d) {
        return Math.ceil(parseFloat(d.value));
    }) + 1;

    var delta = (max-min)/3.0;
    var new_limits = [min, d3.format(".1f")(min+delta,1), d3.format(".1g")(max-delta,1) ,max];
    $j('#slide1').slider("option",{min: min, max: max});
    $j('#slide1').slider("option",{values: new_limits.slice(1, new_limits.length-1)});

    update_heatmap( $j('#slide1').slider.limits(new_limits));

}

function draw_slider(){
    // script for slider
    //var margin = {top: 200, right: 50, bottom: 200, left: 50},
    var margin = {top: 2, right: 5, bottom: 2, left: 20},
        width = 850 - margin.left - margin.right,
        height = 50 - margin.bottom - margin.top;

    var x = d3.scale.linear()
        .domain([0, 100])
        .range([0, width])
        .clamp(true);

    var brush = d3.svg.brush()
        .x(x)
        .extent([0, 0])
        .on("brush", brushed);

    d3.select("svg.slider")
        .remove();

    var svg = d3.select("#slider").append("svg")
        .attr("width", width + margin.left + margin.right+30)
        .attr("height", height + margin.top + margin.bottom)
        .attr("class", "slider")
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    svg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + height / 2 + ")")
        .call(d3.svg.axis()
            .scale(x)
            .orient("bottom")
            .tickFormat(function(d) { return d+"%"; })
            .tickSize(0)
            .tickPadding(12))
        .select(".domain")
        .select(function() { return this.parentNode.appendChild(this.cloneNode(true)); })
        .attr("class", "halo");

    var slider = svg.append("g")
        .attr("class", "slider")
        .call(brush);

    slider.selectAll(".extent,.resize")
        .remove();

    slider.select(".background")
        .attr("height", height);

    var handle = slider.append("circle")
        .attr("class", "handle")
        .attr("transform", "translate(0," + height / 2 + ")")
        .attr("r", 9);

    slider.call(brush.event)
        .transition() // gratuitous intro!
        .duration(750)
        .call(brush.extent([70, 70]))
        .call(brush.event);

    function brushed() {
        var value = brush.extent()[0];

        if (d3.event.sourceEvent) { // not a programmatic event
            value = x.invert(d3.mouse(this)[0]);
            brush.extent([value, value]);
        }
        filter_heatmap_data(value);
        handle.attr("cx", x(value));
    }
}
function filter_heatmap_data(threshold){

    var filtered_data = new Array();
    for(var i in heatmap_data){
        var value = parseFloat(heatmap_data[i]["value"]);
        if(value != NaN && value <= parseFloat(threshold)){
            filtered_data.push(heatmap_data[i]);
        }
    }
    draw_heatmap(filtered_data);
}