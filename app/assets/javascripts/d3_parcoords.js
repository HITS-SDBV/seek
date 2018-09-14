

var parcoord_data;
var graph;
var color_range = ["#fed98e", "#a1dab4" , "#41b6c4", "#2c7fb8", "#253494"];
//color_range = [ "#74a92c", "#f33"]; //red-green
//['#fc8d59','#ffffbf','#91bfdb'];// (red-white-blue)
//['#fc8d59','#ffffbf','#91cf60']; //(red-yellow-green)
var color_set;
var H_OFFSET = 10;
var pcHeight = 600;

function initialize(data, textLength){
    parcoord_data = data;
    var data_length = data.length;
    //parse data, keep numbers up to 2 decimal points
    var col_names = {};
    for(var i=0; i<data_length; i++) {
        for(var prop in parcoord_data[i]){
            //keep a list for all possible axes names to track missing elements
            if (col_names[prop] === undefined) col_names[prop] = 1;
            //should be faster comparison than isNan
            if (parcoord_data[i][prop] == +parcoord_data[i][prop]) {
                //if (! isNaN(parcoord_data[i][prop])) {
                //toFixed returns a string, use a second parseFloat to remove trailing zeroes ("100.00" ==> "100")
                parcoord_data[i][prop] = parseFloat(parseFloat(parcoord_data[i][prop]).toFixed(2)).toString();
            }
        }
    }
    //assign "" to empty cells, otherwise tooltip labels are messed up for lines with missing values
    for(var i=0; i<data_length; i++) {
        for (var key in col_names) {
            if (parcoord_data[i][key] === undefined || ( parcoord_data[i][key] == "NaN") ) {
                parcoord_data[i][key] = "";
            }
        }
    }

    //color_set = d3.scale.linear()
    //          .range(color_range);

    //can only get style of visible elements, not the new popup.
    pcWidth =   d3.select("div.spreadsheet_container").style("width").replace("px","");
    d3.select("div.spreadsheet_popup").style("width", pcWidth+"px");
    d3.select("div#parcoords_plot").style("width", pcWidth+"px");

    // set parallel coordinates
    //chaining .width(value) to the d3 commands does not work. Might only be events (like brushMode) which can be chained
    config = {width: pcWidth, height: pcHeight, alpha: 1};
    graph = d3.parcoords(config)('#parcoords_plot')
        .data(parcoord_data)
        .margin({ top: 130, left: 8 * textLength, bottom: 40, right: 0 })
        //   .margin({ top: 100, left: 0, bottom: 40, right: 0 })
        //.mode("queue")
        //.composite("darker") //darken
        //.dimensionTitleRotation(270)
        .rate(5)
        .render()
        .brushMode("Multiple ranges")  // enable brushing
        //    .shadows()
        .reorderable();
    //.interactive();

} //end initialize

function draw_parallel_coord(data) {
    // collect text for first column to adjust left margin
    var firstCell = data.map(function(d){return d3.values(d)[0];});
    // find the longest text size in the first row to adjust left margin
    var textLength = 0;
    firstCell.forEach(function(d){
        if (d.length > textLength) textLength = d.length;
    });
    initialize(data, textLength);

    // add instruction text
    var instructions = "- Drag along axis to create filter(s), or click axis outside the filters to clear" + "</br>" +  "- Text labels:  click a label to color the data based on axis values"+
        " / double-click to invert the axis / drag label to move reorder the axis / roll mouse wheel over the label to rotate it" + "</br> " + "- Hover on each line to highlight" + "</br>" +
        "- Match conditions: the lines are filtered to  match ALL selected ranges (one range match per axis) or ANY of the selected ranges (at least one match on all axes altogether)";
    d3.select(".pcButtons")
        .style("margin-top", (graph.height()+H_OFFSET).toString()+"px")
        .append("p")
        .attr("id", "instructions").append("text")
        .html(instructions)
        .attr("text-anchor", "middle")
        .attr("text-decoration", "overline")
        .attr("transform", "translate(" + graph.width()/2 + "," + (graph.height()) + ")");;


    // set the initial coloring based on the 2nd column
    update_colors(d3.keys(parcoord_data[0])[1]);

    // click label to activate coloring
    graph.svg.selectAll(".dimension")
        .on("click", update_colors)
        .selectAll(".label");
    //   .style("font-size", "14px"); // change font sizes of selected lable

    //add hover event
    d3.select("#parcoords_plot svg")
        .on("mousemove", function() {
            var mousePosition = d3.mouse(this);
            highlightLineOnClick(mousePosition, true); //true will also add tooltip
        })
        .on("mouseout", function(){
            cleanTooltip();
            graph.unhighlight();
        });

    /* the  following sets up different brush modes */
    /* var sltBrushMode = d3.select('#sltBrushMode');
     sltBrushMode.selectAll('option')
             .data(graph.brushModes())
             .enter()
             .append('option')
             .text(function(d) { return d; });

     sltBrushMode.on('change', function() {
         graph.brushMode(this.value);
         switch(this.value) {
             case 'None':
       //          d3.select("#pStrums").style("visibility", "hidden");
                 d3.select("#lblPredicate").style("visibility", "hidden");
                 d3.select("#sltPredicate").style("visibility", "hidden");
                 d3.select("#btnReset").style("visibility", "hidden");
                 break;
             // case '2D-strums':
             //     d3.select("#pStrums").style("visibility", "visible");
             //     break;
             default:
                 d3.select("#pStrums").style("visibility", "hidden");
                 d3.select("#lblPredicate").style("visibility", "visible");
                 d3.select("#sltPredicate").style("visibility", "visible");
                 d3.select("#btnReset").style("visibility", "visible");
                 break;
         }
     });

     sltBrushMode.property('value', 'Single range');*/
    d3.select("#keepData").on("click", keep_data);
    d3.select("#excludeData").on("click", exclude_data);
    d3.select('#btnReset').on('click', function() {graph.brushReset();});
    d3.select("#resetData").on("click", reset_data);
    d3.select('#sltPredicate').on('change', function() {
        graph.brushPredicate(this.value);
    });

} //end of draw_parallel_coord function

function getActiveDim() {
    var all_dims = graph.svg.selectAll(".dimension");
    for (var i = 0; i < all_dims[0].length; i++) {
        if (all_dims[0][i].style["font-weight"] == 'bold') {return i;}
    }
}

function reset_data() {
    console.log("reset");
    graph.rescale_for_selection(parcoord_data);
    update_colors(d3.keys(parcoord_data[0])[getActiveDim()]);
};
// Inspired by Nutrient Explorer: http://bl.ocks.org/syntagmatic/raw/3150059/
function keep_data() {
    new_data = getActiveData();
    console.log(new_data.length);
    if (new_data.length == 0) {
        alert("Cannot remove all data.\n\nTry expanding filters to get your data back. Then click 'Keep Data' when you've selected data you want to look closer at.");
        return false;
    }
    graph.rescale_for_selection(new_data);
    update_colors(d3.keys(parcoord_data[0])[getActiveDim()]);

};

function exclude_data() {
    new_data = _.difference(graph.data(), getActiveData());
    if (new_data.length == 0) {
        alert("Cannot remove all data.\n\nTry removing some filters to get your data back. Then click 'Exclude Data' when you've selected data you want to remove.");
        return false;
    }
    graph.rescale_for_selection(new_data);
    update_colors(d3.keys(parcoord_data[0])[getActiveDim()]);
};

//   //from here: tooltip code + highlighting
// update color and font weight of chart based on axis selection
// modified from here: http://bl.ocks.org/mostaphaRoudsari/b4e090bb50146d88aec4
function update_colors(dimension) {
    // change the fonts to bold
    graph.svg.selectAll(".dimension")
        .style("font-weight", "normal")
        .filter(function(d) { return d == dimension; })
        .style("font-weight", "bold");
    //the above works in standalones but not in SEEK, therefore we add bold
    //in the text label
    graph.svg.selectAll('text.label')
        .style("font-weight", "normal")
        .filter(function(d) { return d == dimension; })
        .style("font-weight", "bold");

    var color_arr_size = color_range.length;
    var domain_array=[];
    // change color of lines
    // set domain+range of color scale
    var types = graph.detectDimensionTypes(graph.data());
    if (types[dimension] === 'number') {
        var vals = graph.data().map(function(d){return parseFloat(d[dimension]);});

        var delta = (d3.max(vals) - d3.min(vals)) / (color_arr_size-1)

        for (var i=0; i<color_arr_size; i++) {
            domain_array[i] = d3.min(vals) + i*delta
        }

        color_set = d3.scale.linear()
            .range(color_range)
            .domain(domain_array);
        //.domain([d3.min(vals), d3.max(vals)]);
        //.domain([Math.sqrt(d3.min(vals)), Math.sqrt(d3.max(vals))]);
        //categorical data
    } else {
        var vals = graph.data().map(function(d){return d[dimension];}).sort();
        vals = eliminateDuplicates(vals)
        /* ---
        domain + range are not enough here to define the mapping to the colors
        as in typical linear scales. Therefore we map the range of vals [0,vals.length]
        to a color scale in a domain of [0, vals.length]
        ---*/

        var delta = vals.length / (color_arr_size-1)
        for (var i=0; i<color_arr_size; i++) {
            domain_array[i] = i*delta
        }
        color_set = d3.scale.ordinal()
            .domain(vals)
            .range(d3.range(vals.length).map(d3.scale.linear()
            // .domain([0, vals.length - 1])
                .domain(domain_array)
                .range(color_range)
                .interpolate(d3.interpolateLab)));
        //.range(colorbrewer.RdYlGn[9]);
    }

    // change colors for each line
    graph.color(function(d){return color_set([d[dimension]]);}).render();
};

/* Taken from:
* https://dreaminginjavascript.wordpress.com/2008/08/22/eliminating-duplicates/
* */
function eliminateDuplicates(arr) {
    var i,
        len=arr.length,
        out=[],
        obj={};

    for (i=0;i<len;i++) {
        obj[arr[i]]=0;
    }
    for (i in obj) {
        out.push(i);
    }
    return out;
}

// Add highlight for every line on click
function getCentroids(data){
    // this function returns centroid points for data. I had to change the source
    // for parallelcoordinates and make compute_centroids public.
    var margins = graph.margin();
    var graphCentPts = [];
    data.forEach(function(d){

        var initCenPts = graph.compute_centroids(d).filter(function(e, i){return i%2==0;});
        // move points based on margins, and on missing value offset if there's no value
        // need to traverse object d with col_key
        var gdim = graph.dimensions();
        var cenPts = initCenPts.map(function(p, i){
            if (graph.value_exists(d[gdim[i]])) {
                return [p[0] + margins["left"], p[1] + margins["top"]];
            } else {
                return [p[0] + margins["left"], p[1] + margins["top"] + +graph.get_missingVOffset()]; //extra + converts to float
            }
        });

        graphCentPts.push(cenPts);
    });
    return graphCentPts;
}

function getActiveData(){
    // I'm pretty sure this data is already somewhere in graph
    if (graph.brushed()!=false) return graph.brushed();
    return graph.data();
}

function isOnLine(startPt, endPt, testPt, tol){
    // check if test point is close enough to a line
    // between startPt and endPt. close enough means smaller than tolerance
    var x0 = testPt[0];
    var	y0 = testPt[1];
    var x1 = startPt[0];
    var	y1 = startPt[1];
    var x2 = endPt[0];
    var	y2 = endPt[1];
    var Dx = x2 - x1;
    var Dy = y2 - y1;
    var delta = Math.abs(Dy*x0 - Dx*y0 - x1*y2+x2*y1)/Math.sqrt(Math.pow(Dx, 2) + Math.pow(Dy, 2));
    if (delta <= tol) return true;
    return false;
}

function findAxes(testPt, cenPts){
    // finds between which two axis the mouse is
    var x = testPt[0];
    var y = testPt[1];
    // make sure it is inside the range of x
    if (cenPts[0][0] > x) return false;
    if (cenPts[cenPts.length-1][0] < x) return false;

    // find between which segment the point is
    for (var i=0; i<cenPts.length; i++){
        if (cenPts[i][0] > x) return i;
    }
}

function cleanTooltip(){
    // removes any object under #tooltip is
    graph.svg.selectAll("#tooltip")
        .remove();
}

function addTooltip(clicked, clickedCenPts){

    // add tooltip to multiple clicked lines
    var clickedDataSet = [];
    var margins = graph.margin();
    var dims = graph.dimensions();
    // get all the values into a single list
    for (var i=0; i<clicked.length; i++){
        for (var j=0; j<clickedCenPts[i].length; j++){
            //var reordered_col = graph.get_reorderDim_i(j);
            //if nothing was reordered, reordered_col = j
            //clicked[i] is a row (hash type object). d3.values(row)[j] gets the value of col j
            // var text = d3.values(clicked[i])[reordered_col]; //--> doesn't work anymore with multiple sheets?
            var text = clicked[i][dims[j]];
            var x = clickedCenPts[i][j][0] - margins.left;
            var y = clickedCenPts[i][j][1] - margins.top;
            clickedDataSet.push([x, y,text]);
        }
    };

    // add rectangles
    var fontSize = 14;
    var padding = 2;
    var rectHeight = fontSize + 2 * padding; //based on font size
    graph.svg.selectAll("rect[id='tooltip']")
        .data(clickedDataSet).enter()
        .append("rect")
        .attr("x", function(d) { return d[0] - d[2].length * 5;})
        .attr("y", function(d) { return d[1] - rectHeight + 2 * padding; })
        .attr("rx", "2")
        .attr("ry", "2")
        .attr("id", "tooltip")
        .attr("fill", "grey")
        .attr("opacity", 0.9)
        .attr("width", function(d){return d[2].length * 10;})
        .attr("height", rectHeight);

    // add text on top of rectangle
    graph.svg.selectAll("text[id='tooltip']")
        .data(clickedDataSet).enter()
        .append("text")
        .attr("x", function(d) { return d[0];})
        .attr("y", function(d) { return d[1]; })
        .attr("id", "tooltip")
        .attr("fill", "white")
        .attr("text-anchor", "middle")
        .attr("font-size", fontSize)
        .text( function (d){ return d[2];});
}

function getClickedLines(mouseClick){
    var clicked = [];
    var clickedCenPts = [];
    // find which data is activated right now
    var activeData = getActiveData();

    // find centriod points: get pc axis intersection points
    // graphCentPts = Array[ #rows ] where
    // graphCentPts[row] =  Array[#dim] where
    // graphCentPts[row][dim] = [x_dim, y_dim] == where line row intersects with axis of dimension dim
    var graphCentPts = getCentroids(activeData);
    if (graphCentPts.length==0) return false;

    // find between which axes the point is
    var axeNum = findAxes(mouseClick, graphCentPts[0]);
    if (!axeNum) return false;

    graphCentPts.forEach(function(d, i){
        if (isOnLine(d[axeNum-1], d[axeNum], mouseClick, 2)){
            clicked.push(activeData[i]);
            clickedCenPts.push(graphCentPts[i]); // for tooltip
        }
    });
    return [clicked, clickedCenPts];
}


function highlightLineOnClick(mouseClick, drawTooltip){

    var clicked = [];
    var clickedCenPts = [];
    clickedData = getClickedLines(mouseClick);

    if (clickedData && clickedData[0].length!=0){
        clicked = clickedData[0];
        clickedCenPts = clickedData[1];
        // highlight clicked line
        graph.highlight(clicked);
        if (drawTooltip){
            // clean if anything is there
            cleanTooltip();
            // add tooltip
            addTooltip(clicked, clickedCenPts);
        }

    }
};
//
// function dataURItoBlob(dataURI) {
//     // convert base64/URLEncoded data component to raw binary data held in a string
//     var byteString;
//     if (dataURI.split(',')[0].indexOf('base64') >= 0)
//         byteString = atob(dataURI.split(',')[1]);
//     else
//         byteString = unescape(dataURI.split(',')[1]);
//
//     // separate out the mime component
//     var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
//
//     // write the bytes of the string to a typed array
//     var ia = new Uint8Array(byteString.length);
//     for (var i = 0; i < byteString.length; i++) {
//         ia[i] = byteString.charCodeAt(i);
//     }
//
//     return new Blob([ia], {type:mimeString});
// }
//
/* Export code */
jQuery(document).ready(function () {
    jQuery('.export').click(function () {
        var svg_selection1 = document.querySelector('svg');
        var svgString1 = new XMLSerializer().serializeToString(svg_selection1);

        inlineAllStyles();
        //d3.select('svg').selectAll('rect').remove();
        var svg_selection = document.querySelector('svg');
        var svgString = new XMLSerializer().serializeToString(svg_selection);

        var canvas_list = document.getElementsByTagName("canvas");
        var context = [];
        for (var i = 0; i < canvas_list.length; i++) {
            context[i] = canvas_list[i].getContext('2d');
        }

        var newCanvas = document.createElement('canvas');
        var svgW = svg_selection.getAttribute('width');
        var svgH = svg_selection.getAttribute('height');
        var canH = d3.select('canvas')[0][0].height;
        var canW = d3.select('canvas')[0][0].width;

//            var newCanvas = d3.select("#png_container")
//                    .append("canvas")[0][0];

        newCanvas.width = svgW;
        newCanvas.height = svgH;

        //var popup = window.open("");
        // popup.document.write(newCanvas);
        var ctx = newCanvas.getContext('2d');
        var img = new Image();

        //{type: "image/png"});
        var svgExp = new Blob([svgString], {type: "image/svg+xml;charset=utf-8"});

        var DOMURL = self.URL || self.webkitURL || self;
        var url = DOMURL.createObjectURL(svgExp);

        img.onload = function () {
            ctx.drawImage(img, 0, 0);
            //context[0].drawImage(img, -35, -100, graph.width(), graph.height() );
            for (var i = 1; i < canvas_list.length; i++) {
                //context[0].drawImage(canvas_list[i],0,0);
                ctx.drawImage(canvas_list[i], svgW - canW,  graph.margin().top);
            }
            //var dataURL = context[0].canvas.toDataURL("image/png");
            var dataURL = ctx.canvas.toDataURL("image/png");
            document.querySelector('#png_container').innerHTML = '<img src="' + dataURL + '"/>';
            var data = atob(dataURL.replace(/^.*?base64,/, '')), //substring( "data:image/png;base64,".length ) ),
                asArray = new Uint8Array(data.length);

            for (var i = 0, len = data.length; i < len; ++i) {
                asArray[i] = data.charCodeAt(i);
            }
            var blobObject = new Blob([asArray.buffer], {type: "image/png"});
            var asArray2 = new Uint8Array(data.length);
            for (var i = 0, len = svgString.length; i < len; ++i) {
                asArray2[i] = svgString.charCodeAt(i);
            }
            saveAs(blobObject, "parallelCoord.png");
            //
            DOMURL.revokeObjectURL(dataURL);
            d3.select("img").remove();

        };
        img.src = url;
    });
});

/* Attention!!
This function will inline CSS styles, can be done for many files ('css')
dependning on the value of cssText - but then need to push into the 'svg_style'
array instead of overriding previous values.
For parcoords, it is  done only on the special css file created for it.
*/
function inlineAllStyles() {
    var svg_style, selector;
    var cssText = 'spreadsheet_parcoords';

    for (var i = 0; i <= document.styleSheets.length - 1; i++) {
        //loop through your stylesheets
        if (document.styleSheets[i].href && document.styleSheets[i].href.indexOf(cssText) != -1) {
            //pull out the styles from the one you want to use
            if (document.styleSheets[i].rules != undefined) {
                svg_style = document.styleSheets[i].rules;
            } else {
                svg_style = document.styleSheets[i].cssRules;
            }
        }
    }

    if (svg_style != null && svg_style != undefined) {
        for (var i = 0; i < svg_style.length; i++) {
            if (svg_style[i].type == 1) {

                selector = svg_style[i].selectorText;

                styles = makeStyleObject(svg_style[i]);

                // Apply the style directly to the elements that match the selctor
                // (this requires to not have to deal with selector parsing)
                d3.selectAll(selector).style(styles);
            }
        };
    }
}

function makeStyleObject(rule) {
    var styleDec = rule.style;
    var output = {};
    var s;

    for (s = 0; s < styleDec.length; s++) {
        output[styleDec[s]] = styleDec[styleDec[s]];
        if(styleDec[styleDec[s]] === undefined) {
            //firefox being firefoxy
            output[styleDec[s]] = styleDec.getPropertyValue(styleDec[s]);
        }
    }

    return output;
}
