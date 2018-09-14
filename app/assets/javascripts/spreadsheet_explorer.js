//= require spreadsheet_json
//= require filesaverjs
//= require blob-polyfill

function annotation_source(id, type, name, url) {
    this.id = id;
    this.type = type;
    this.name = name;
    this.url = url;
    this.annotations = [];
}

function annotation(id, type, sheet_number, cell_range, content, date_created) {
    this.id = id;
    this.type = type;
    this.sheetNumber = sheet_number;
    this.cellRange = cell_range;
    this.content = content;
    this.dateCreated = date_created;

    var cell_coords = explodeCellRange(cell_range);
    this.startCol = cell_coords[0];
    this.startRow = cell_coords[1];
    this.endCol = cell_coords[2];
    this.endRow = cell_coords[3];
}

var $j = jQuery.noConflict(); //To prevent conflicts with prototype

// http://some-base-url/data_files/2/explore?version=1#"
var xml_url = (window.location.href).replace(new RegExp("(\\d+)/explore.*$"), "$1/data.xml");
console.log("Getting XML file at: ", xml_url);
var full_json_obj;
if (xml_url.indexOf("data.xml") != -1) {
    console.log("Success! Converting to json...");
    full_json_obj = {workbook: [xml2json(get_xml_file(xml_url), "")]};
}

$j(window)
    .resize(function(e) {
        adjust_container_dimensions();
    });

$j(document).ready(function ($) {

    //Auto scrolling
    var xInc = "+=0";
    var yInc = "+=0";
    var slowScrollBoundary = 100; //Distance from the edge of the spreadsheet in pixels at which automatic scrolling starts when dragging out a selection
    var fastScrollBoundary = 50; //As above, but faster scrolling
    var scrolling = false;

    //Cell selection
    var isMouseDown = false,
        startRow,
        startCol,
        endRow,
        endCol;

    //To disable text-selection
    //http://stackoverflow.com/questions/2700000/how-to-disable-text-selection-using-jquery
    $.fn.disableSelect = function() {
        $(this).attr('unselectable', 'on')
            .css('-moz-user-select', 'none')
            .each(function() {
                this.onselectstart = function() { return false; };
            });
    };

    //Clickable worksheet tabs
    $("a.sheet_tab")
        .click(function () {
            activateSheet(null, $(this));
        })
        .mouseover(function (){
            this.style.cursor = 'pointer';
        });

    //Cell selection
    $("table.sheet td.cell")
        .mousedown(function (evt) {
            //enable selection of cells only in spreadsheet explore, not search preview.
            if ($('div#spreadsheet_outer_frame').length > 0) {
                if (!isMouseDown) {
                    //Update the cell info box to contain either the value of the cell or the formula
                    // also make hovering over the info box display all the text.
                    if ($(this).attr("title")) {
                        $('#cell_info').val($(this).attr("title"));
                        $('#cell_info').attr("title", $(this).attr("title"));
                    }
                    else {
                        $('#cell_info').val($(this).html());
                        $('#cell_info').attr("title", $(this).html());
                    }
                    isMouseDown = true;
                    startRow = parseInt($(this).attr("row"));
                    startCol = parseInt($(this).attr("col"));
                }
                //select_cells(startCol, startRow, startCol, startRow, null);
                //from nmtrypi
                var selected = $(this).hasClass("selected_cell");

                if(selected){
                    $(this).trigger("deselect");
                }else{
                    $(this).trigger("select",[evt.ctrlKey]);
                }

                if( $('#cell_menu').css("display") === "block"){
                    $('#cell_menu').hide();
                }
                
                return false; // prevent text selection
            }
        })
        .mouseover(function (evt) {
            if (isMouseDown) {

                endRow = parseInt($(this).attr("row"));
                endCol = parseInt($(this).attr("col"));

                var selected = $(this).hasClass("selected_cell");

                if(!selected){

                    $(this).addClass("selected_cell");
                    select_cells(startCol, startRow, endCol, endRow, null, evt.ctrlKey);
                    // put in input field
                }
                //select_cells(startCol, startRow, endCol, endRow, null);
            }
        })
        .on("select", function(evt, ctrl_key){
            $(this).addClass("selected_cell");
            select_cells(startCol, startRow, startCol, startRow, null, ctrl_key);
            //put in input field
        })
        .on("deselect", function(evt){
            $(this).removeClass("selected_cell");
            var row = parseInt($(this).attr("row"));
            var col = parseInt($(this).attr("col"));
            // console.log("deselect cell at row: " + row + ", col: "+ col);
            var selected_cells_in_row =  $("table.active_sheet tr td.selected_cell[row="+ row +"]"),
                selected_cells_in_col =  $("table.active_sheet tr td.selected_cell[col=" + col + "]");

            if(selected_cells_in_row.length===0){
                $("div.row_heading").slice(row-1, row).removeClass("selected_heading");
            }

            if(selected_cells_in_col.length===0){
                $("div.col_heading").slice(col-1, col).removeClass("selected_heading");
            }
        })
    ;

    //Auto scrolling when selection box is dragged to the edge of the view
    $("div.sheet")
        .mousemove(function (e) {
            if(isMouseDown)
            {
                var sheet = $("div.active_sheet");
                if(e.pageY >= (sheet.position().top + sheet.outerHeight()) - slowScrollBoundary)
                    if(e.pageY >= (sheet.position().top + sheet.outerHeight()) - fastScrollBoundary)
                        yInc =  "+=50px";
                    else
                        yInc =  "+=10px";
                else if (e.pageY <= (sheet.position().top + slowScrollBoundary))
                    if (e.pageY <= (sheet.position().top + fastScrollBoundary))
                        yInc = "-=50px";
                    else
                        yInc = "-=10px";
                else
                    yInc = "+=0";

                if(e.pageX >= (sheet.position().left + sheet.outerWidth()) - slowScrollBoundary)
                    if(e.pageX >= (sheet.position().left + sheet.outerWidth()) - fastScrollBoundary)
                        xInc =  "+=50px";
                    else
                        xInc =  "+=10px";
                else if (e.pageX <= (sheet.position().left + slowScrollBoundary))
                    if (e.pageX <= (sheet.position().left + fastScrollBoundary))
                        xInc = "-=50px";
                    else
                        xInc = "-=10px";
                else
                    xInc = "+=0";

                if(xInc == "+=0" && yInc == "+=0")
                {
                    scrolling = false;
                }
                else if (!scrolling)
                {
                    sheet.stop();
                    scrolling = true;
                    scroll(sheet);
                }
            }
        })
    ;

    //Scroll headings when sheet is scrolled
    $("div.sheet")
        .scroll(function (e) {
            $(this).parent().find("div.row_headings").scrollTop(($(this)).scrollTop());
            $(this).parent().parent().find("div.col_headings").scrollLeft(($(this)).scrollLeft());
        })
    ;

    //http://stackoverflow.com/questions/1511529/how-to-scroll-div-continuously-on-mousedown-event
    function scroll(object) {
        if(!scrolling)
            object.stop();
        else
        {
            object.animate({scrollTop : yInc, scrollLeft : xInc}, 100, function(){
                if (scrolling)
                    scroll(object);
            });
        }
    };

    $(document)
        .mouseup(function () {
            if (isMouseDown)
            {
                isMouseDown = false;
                if(scrolling)
                {
                    scrolling = false;
                    $('div.active_sheet').stop();
                }
                //Hide annotations
                $('#annotation_container').hide();
                $('div.annotation').hide();
            }
        })
    ;

    //Select cells that are typed in the input field (triggered by 'enter' or special button)
    // ',' separates different selections,  '!' separates location(sheets) from chosen range, ':' separates edges of range(A1:C20)
    //possible forms: future addition: [file1:]
    // 1. sheet1!A1:C10,sheet2!B3:J90, ...
    // 2. sheet1:sheet4!A1:C10, ....
    function select_typed_input(selection_text) {
        //var active_sheet = $("div.active_sheet");
        //var active_sheet_number = active_sheet[0].id.split('_')[1];
        var selections_arr = selection_text.replace(/\s+/g,'').split(',');
        deselect_cells();
        var multiple = true;
        var from_input = true;
        $('#selection_data').val(selection_text);

        //for (single_sel of selections_arr) {
        for (k=0; k<selections_arr.length; k++ ){
            //console.log("single_selection: ", selections_arr[k]);

            //loc_element[0] = sheet information, could be multiple sheets, one sheet, or none (default: active_sheet)
            //loc_element[1] = range of cells, unless previous doesn't exist.
            var loc_element = selections_arr[k].split('!');

            //if no sheet specified, select given range on active sheet
            if (loc_element.length == 1) {
                select_range(loc_element[0], null, multiple, from_input);

                //sheet(s) were specified i.e "sheet1:sheet3"
            } else {
                locations = loc_element[0].split(':');
                var sheetNum1 = locations[0].match(/\d+/)[0];
                var sheetNum2 = locations.length > 1 ? locations[1].match(/\d+/)[0]: sheetNum1;
                //iterate on sheets to select the typed range on each
                for (var i=sheetNum1;i<=sheetNum2;i++) {
                    select_range(loc_element[1], i, multiple, from_input);
                }
            }
        } //done with a string of a single selection
    }

    //Select cells that are typed in
    $('input#selection_data')
        .keyup(function(e) {
            if(e.keyCode == 13) {
                select_typed_input($('#selection_data').val());
            }
        })
    ;

    //Select cells that are typed in when clicking on the "apply selection" button
    $('#applySelection').click(function() {
        select_typed_input($('#selection_data').val());
    });

    //Resizable column/row headings
    //also makes them clickable to select all cells in that row/column
    $( "div.col_heading" )
        .attr("col_selected", false)
        .resizable({
            minWidth: 20,
            handles: 'e',
            stop: function (){
                //when in spreadsheet "explore"
                if ( (window.location.href).indexOf("explore") > -1 ) {
                    $("table.active_sheet col:eq(" + ($(this).index() - 1) + ")").width($(this).width());
                } else {
                    var obj_id = activate_sheet_from_resizable(this);
                    $("table." + obj_id + ".active_sheet col:eq(" + ($(this).index() - 1) + ")").width($(this).width());
                }
                if ($j("div.spreadsheet_container").width()>max_container_width()) {
                    adjust_container_dimensions();
                }
            }
        })
        .mousedown(function(evt){
            //enable selection of cells only in spreadsheet explore, not search preview.
            if ($('div#spreadsheet_outer_frame').length > 0) {
                var col = $(this).index();
                selected= $(this).attr("col_selected")==="true";
                if (selected) {
                    $(this).trigger("deselect");
                } else {
                    $(this).trigger("select",[evt.ctrlKey]);
                }
                $(this).attr("col_selected", !selected);

               // var last_row = $(this).parent().parent().parent().find("div.row_heading").size();
               // select_cells(col, 1, col, last_row, null);
            }
        })
        .on("select", function(evt, ctrl_key){
            $(this).addClass("selected_heading");
            var col = $(this).index();
            var last_row = $(this).parent().parent().parent().find("div.row_heading").length;
            select_cells(col,1,col,last_row,null, ctrl_key);

        })
        .on("deselect", function(){
            $(this).removeClass("selected_heading");
            var col = $(this).index();
            $("table.active_sheet tr td.selected_cell[col=" + col + "]").trigger("deselect");//removeClass("selected_cell");
        })
    ;
    $( "div.row_heading" )
        .attr("row_selected", false)
        .resizable({
            minHeight: 15,
            handles: 's',
            stop: function (){
                var height = $(this).height();
                //when in spreadsheet "explore"
                if ( (window.location.href).indexOf("explore") > -1 ) {
                     $("table.active_sheet tr:eq(" + $(this).index() + ")").height(height).css('line-height', height - 2 + "px");
                } else {
                    var obj_id = activate_sheet_from_resizable(this);
                    $("table." + obj_id + ".active_sheet tr:eq(" + $(this).index() + ")").height(height).css('line-height', height - 2 + "px");
                }
            }
        })
        .mousedown(function(evt){
            //enable selection of cells only in spreadsheet explore, not search preview.
            if ($('div#spreadsheet_outer_frame').length > 0) {
                var selected= $(this).attr("row_selected") === "true";
                if(selected){
                    $(this).trigger("deselect");
                }else{
                    $(this).trigger("select", [evt.ctrlKey]);
                }
                $(this).attr("row_selected", !selected);
                //var row = $(this).index() + 1;
                //var last_col = $(this).parent().parent().parent().find("div.col_heading").size();
                //select_cells(1, row, last_col, row, null);
            }
        })
        .on("select", function(evt, ctrl_key){
            var row = $(this).index() + 1,
                last_col = $(this).parent().parent().parent().find("div.col_heading").length;
            $(this).addClass("selected_heading");
            select_cells(1,row,last_col,row,null, ctrl_key);

        })
        .on("deselect", function(){
            var row = $(this).index() + 1;
            $(this).removeClass("selected_heading");
            $("table.active_sheet tr td.cell[row=" + row + "]").trigger("deselect");
        })
    ;
    adjust_container_dimensions();
//    adjust_container_dimensions();


});

function activate_sheet_from_resizable(div_obj) {
    var obj_id_sheetN = div_obj.parentNode.parentNode.parentNode.id.split('_');
    activateSheet(null, $j($j("a.sheet_tab."+ obj_id_sheetN[1] )[obj_id_sheetN[2]-1] ) );
    return obj_id_sheetN[1];
}
function max_container_width() {
    var max_width = $j(".corner_heading").width();
    $j(".col_heading").each(function() {
        max_width += parseInt($(this).style.width); //$(this).offsetWidth does not worked when the element is in a hidden tab
    });
    return max_width;
}

function adjust_container_dimensions() {
    var selector = $j("div.spreadsheet_container");
    var max_width = max_container_width();
    var spreadsheet_container_width = selector.width();
    if (spreadsheet_container_width>=max_width) {
        selector.width(max_width);
        spreadsheet_container_width = max_width;
    }
    else {
        selector.width("95%");
        spreadsheet_container_width = selector.width();
    }
    //var sheet_container_width = spreadsheet_container_width - 2;
    //var sheet_width = spreadsheet_container_width -45;
    //$j(".sheet_container").width(sheet_container_width);
    //$j(".sheet").width(sheet_width);
}

//Convert a numeric column index to an alphabetic one
function num2alpha(col) {
    var result = "";
    col = col-1; //To make it 0 indexed.

    while (col >= 0)
    {
        result = String.fromCharCode((col % 26) + 65) + result;
        col = Math.floor(col/26) - 1;
    }
    return result;
}

//Convert an alphabetic column index to a numeric one
function alpha2num(col) {
    var result = 0;
    for(var i = col.length-1; i >= 0; i--){
        result += Math.pow(26,col.length - (i + 1)) * (col.charCodeAt(i) - 64);
    }
    return result;
}

//Turns an excel-style cell range into an array of coordinates
function explodeCellRange(range) {
    //Split into component parts (top-left cell, bottom-right cell of a rectangle range)
    var array = range.split(":",2);

    //Get a numeric value for the row and column of each component
    var startCol = alpha2num(array[0].replace(/[0-9]+/,""));
    var startRow = parseInt(array[0].replace(/[A-Z]+/,""));
    var endCol;
    var endRow;

    //If only a single cell specified...
    if(array[1] == undefined) {
        endCol = startCol;
        endRow = startRow;
    }
    else {
        endCol = alpha2num(array[1].replace(/[0-9]+/,""));
        endRow = parseInt(array[1].replace(/[A-Z]+/,""));
    }
    return [startCol,startRow,endCol,endRow];
}


//Process annotations
// Links them to their respective sheet/cell/cellranges
// Is called after every AJAX call to rebind the set of annotations that may have
// changed, and to re-enhance DOM elements that have been reloaded
function bindAnnotations(annotation_sources) {
    var annotationIndexTable = $j("div#annotation_overview table");
    for(var s = 0; s < annotation_sources.size(); s++)
    {
        var source = annotation_sources[s];

        //Add a new section in the annotation index for the source
        var stub_heading = $j("<tr></tr>").addClass("source_header").append($j("<td></td>").attr({colspan : 3})
            .append($j("<a>Annotations from " + source.name + "</a>").attr({href : source.url})))
            .appendTo(annotationIndexTable);

        for(var a = 0; a < source.annotations.size(); a++)
        {
            var ann = source.annotations[a];

            //Add a new "stub" in the index
            annotationIndexTable.append(createAnnotationStub(ann));

            //bind annotations to respective table cells
            if (ann.type!="plot_data") {
                bindAnnotation(ann);
            }
        }
    }
    //Text displayed in annotation index if no annotations present
    if(annotation_sources < 1)
    {
        annotationIndexTable.append($j("<tr></tr>").append($j("<td colspan=\"3\">No annotations found</td>")));
    }
    //Make the annotations draggable
    $j('#annotation_container').draggable({handle: '#annotation_drag', zIndex: 100000000000000});
}

//Small annotation summary that jumps to said annotation when clicked
function createAnnotationStub(ann)
{
    var type_class;
    var content;

    if (ann.type=="plot_data") {
        type_class="plot_data_type";
        content = "Graph data";
    }
    else {
        type_class="text_annotation_type";
        content = ann.content.substring(0,40);
    }
    var stub = $j("<tr></tr>").addClass("annotation_stub")
        .append($j("<td>&nbsp;</td>").addClass(type_class))
        .append($j("<td>Sheet"+(ann.sheetNumber+1)+"."+ann.cellRange+"</td>"))
        .append($j("<td>"+content+"</td>"))
        .append($j("<td>"+ann.dateCreated+"</td>"))
        .click( function (){
            goToSheetPage(ann);
        });

    return stub;
}

function goToSheetPage(annotation){
    var paginateForSheet = $('paginate_sheet_' + (annotation.sheetNumber+1));
    if (paginateForSheet != null)
    {
        //calculate the page
        var page = Math.floor(annotation.startRow/perPage) + 1;
        var links = paginateForSheet.getElementsByTagName('a');
        var link;
        for (var i=0; i<links.length; i++){
            if (links[i].text == page.toString()){
                link = links[i];
            }
        }
        if (link != null){
            link.href = link.href.concat('&annotation_id=' + annotation.id);
            clickLink(link);
        }else{
            jumpToAnnotation(annotation.id, annotation.sheetNumber+1, annotation.cellRange);
            $j('#annotation_overview').hide();
        }

    }else{
        jumpToAnnotation(annotation.id, annotation.sheetNumber+1, annotation.cellRange);
        $j('#annotation_overview').hide();
    }
}

function bindAnnotation(ann) {
    var current_page = currentPage(ann.sheetNumber+1);
    var relative_rows = relativeRows(ann.startRow, ann.endRow, ann.sheetNumber+1);
    var relativeMinRow = relative_rows[0];
    var relativeMaxRow = relative_rows[1];
    var startPage =  parseInt(ann.startRow/perPage) + 1;
    if (ann.startRow % perPage == 0)
        startPage -=1;
    var endPage = parseInt(ann.endRow/perPage) + 1;
    if (ann.endRow % perPage == 0)
        endPage -=1;

    //if no pagination, or the annotation belongs to the cell of current page, then bind it to the page
    var annotation_of_current_page = current_page >= startPage && current_page <= endPage;

    if ((current_page == null) || annotation_of_current_page){
        $j("table.sheet:eq("+ann.sheetNumber+") tr").slice((relativeMinRow-1),relativeMaxRow).each(function() {

            $j(this).children("td.cell").slice(ann.startCol-1,ann.endCol).addClass("annotated_cell")
                .click(function () {show_annotation(ann.id,
                    $j(this).position().left + $j(this).outerWidth(),
                    $j(this).position().top);}
            );
        });
    }
}

//to identify the current page for a specific sheet
function currentPage(sheetNumber){
    var paginateForSheet = $('paginate_sheet_' + (sheetNumber));
    if (paginateForSheet != null)
    {
        var current_page = paginateForSheet.getElementsByClassName('current')[0].innerText;
        return Number(current_page);
    }else{
        return null;
    }

}

function toggle_annotation_form(annotation_id) {
    var elem = 'div#annotation_' + annotation_id;

    $j(elem + ' div.annotation_text').toggle();
    $j(elem + ' div.annotation_edit_text').toggle();
    $j(elem + ' #annotation_controls').toggle();
};



//To display the annotations
function show_annotation(id,x,y) {
    var annotation_container = $j("#annotation_container");
    var annotation = $j("#annotation_" + id);
    var plot_element_id = "annotation_plot_data_"+id;
    annotation_container.css('left',x+20);
    annotation_container.css('top',y-20);
    annotation_container.show();
    annotation.show();
    if ($j("#"+plot_element_id).length>0) {
        plot_cells(plot_element_id,'650','450');
    }

}


function jumpToAnnotation(id, sheet, range) {
    //Go to the right sheet
    activateSheet(sheet);

    //Select the cell range
    select_range(range, sheet);

    //Show annotation in middle of sheet
    var cells = $j('.selected_cell');
    show_annotation(id,
        cells.position().left + cells.outerWidth(),
        cells.position().top);
}

function select_range(range, sheetNumber, multiple, from_text) {
    var coords = explodeCellRange(range);
    var startCol = coords[0],
        startRow = coords[1],
        endCol = coords[2],
        endRow = coords[3];

    var active_sheetNumber = $j("div.active_sheet")[0].id.split('_')[1];
    if (!sheetNumber)
        sheetNumber = active_sheetNumber;

    if(startRow && startCol && endRow && endCol)
        ordered_minMax_RC = select_cells(startCol, startRow, endCol, endRow, sheetNumber, multiple, from_text);

    //scroll to selection only if the selection was made on the active sheet
    if (active_sheetNumber == sheetNumber) {
        //Important to keep track of real min/max for the scrolling effect.
        startRow = ordered_minMax_RC[0];
        endRow   = ordered_minMax_RC[1];
        startCol = ordered_minMax_RC[2];
        endCol   = ordered_minMax_RC[3];

        var relative_rows = relativeRows(startRow, endRow, sheetNumber);
        var relativeMinRow = relative_rows[0];
        var relativeMaxRow = relative_rows[1];

        //Scroll to selected
        var row = $j("table.active_sheet tr").slice((relativeMinRow - 1), relativeMaxRow).first();
        var cell = row.children("td.cell").slice(startCol - 1, endCol).first();

        $j('div.active_sheet').scrollTop(row.position().top + $j('div.active_sheet').scrollTop() - 500);
        $j('div.active_sheet').scrollLeft(cell.position().left + $j('div.active_sheet').scrollLeft() - 500);
    }
}
function deselect_cells() {
    //Deselect any cells and headings
    $j(".selected_cell").removeClass("selected_cell");
    $j(".selected_heading").removeClass("selected_heading");
    //Clear selection box
    $j('#selection_data').val("");
    $j('#cell_info').val("");
    //Hide selection-dependent buttons
    $j('.requires_selection').hide();
}


//Select cells in a specified area
function select_cells(startCol, startRow, endCol, endRow, sheetNumber, ctrl_key, from_text) {
    if (!sheetNumber)
        sheetNumber = $j("div.active_sheet")[0].id.split('_')[1];

    var minRow = startRow;
    var minCol = startCol;
    var maxRow = endRow;
    var maxCol = endCol;

    var multiple_select = false;

    if(ctrl_key){
        multiple_select = true;
    }
    //To ensure minRow/minCol is always less than maxRow/maxCol
    // no matter which direction the box is dragged
    if(endRow <= startRow) {
        minRow = endRow;
        maxRow = startRow;
    }
    if(endCol <= startCol) {
        minCol = endCol;
        maxCol = startCol;
    }

    var relative_rows = relativeRows(minRow, maxRow, sheetNumber);
    var relativeMinRow = relative_rows[0];
    var relativeMaxRow = relative_rows[1];

    if(!multiple_select){
        //Deselect any cells and headings
        $j(".selected_cell").removeClass("selected_cell");
        $j(".selected_heading").removeClass("selected_heading");
    }

    //"Select" dragged/typed cells - instead of using "table.active_sheet tr", use:  $j('div.sheet#spreadsheet_1 table tr')
//    $j("table.active_sheet tr").slice(relativeMinRow-1,relativeMaxRow).each(function() {
    $j("div.sheet#spreadsheet_"+sheetNumber+" table tr").slice(relativeMinRow-1,relativeMaxRow).each(function() {
        $j(this).children("td.cell").slice(minCol-1,maxCol).addClass("selected_cell");
    });

    //"Select" dragged/typed cells' column headings [old: $j("div.active_sheet")]
    $j("div.sheet#spreadsheet_"+sheetNumber).parent().parent().find("div.col_headings div.col_heading").slice(minCol-1,maxCol).addClass("selected_heading");

    //"Select" dragged/typed cells' row headings
    $j("div.sheet#spreadsheet_"+sheetNumber).parent().find("div.row_headings div.row_heading").slice(relativeMinRow-1,relativeMaxRow).addClass("selected_heading");

    //Update the selection display e.g A3:B2
    //The following does not work (??) when combined with (multiple) input text selections or multiple click and drag selection or selection across sheets.
    if (from_text === undefined) {
        var selection = "";
        selection += (num2alpha(minCol).toString() + minRow.toString());

        if (maxRow != minRow || maxCol != minCol)
            selection += (":" + num2alpha(maxCol).toString() + maxRow.toString());

        $j('#selection_data').val(selection);
    }

    //Update cell coverage in annotation form
    $j('input.annotation_cell_coverage_class').attr("value",selection);

    //Show selection-dependent controls
    $j('.requires_selection').show();

    return [minRow, maxRow, minCol, maxCol];
}

/* search_matched_spreadsheets_content.html.erb calls with a third argument - fileIndex = item_id
will have more than one spreadsheet_container div */
function activateSheet(sheet, sheetTab, fileIndex) {
    var root_element = null;
    if (sheetTab == null) {
        var i = sheet - 1;
        if (fileIndex == null) {
            sheetTab = $j("a.sheet_tab:eq(" + i + ")");
            /* this is entered only when coming from a search_matched_spreadsheets_content.html.erb,
             being the only caller with a third argument (fileIndex).
             Handles the case where there are many spreadsheet containers in the page, not just one.
             */
        } else {
            sheetTab = $j("a.sheet_tab." + fileIndex + ":eq(" + i + ")");
            root_element = sheetTab.closest("div.spreadsheet_container");
        }
    } else {
         root_element = sheetTab.closest("div.spreadsheet_container");
    }

    var sheetIndex = sheetTab.attr("index");


    //Clean up
    //Hide annotations
    $j('div.annotation').hide();
    $j('#annotation_container').hide();

    //Deselect previous tab
    $j('a.selected_tab').removeClass('selected_tab');

    //Disable old table + sheet
    $j('.active_sheet').removeClass('active_sheet');

    //Hide sheets
    if (root_element == null) {
        //gets here on file explore
        $j('div.sheet_container').hide();
    } else {
        //gets here from search results preview
        $j('div.sheet_container', root_element).hide();
    }
    //Hide paginates
    $j('div.pagination').hide();

    //Select the tab
    sheetTab.addClass('selected_tab');

    //Show the sheet
    $j("div.sheet_container#spreadsheet_" + sheetIndex).show();

    //Show the sheet paginate
    $j("div#paginate_sheet_" + sheetIndex).show();

    var activeSheet = $j("div.sheet#spreadsheet_" + sheetIndex);

    //Show the div + set sheet active
    activeSheet.addClass('active_sheet');

    //Reset scrollbars
    activeSheet.scrollTop(0).scrollLeft(0);

    //Set table active
    activeSheet.children("table.sheet").addClass('active_sheet');

    //deselect_cells();

    //Record current sheet in annotation form
    $j('input#annotation_sheet_id').attr("value", sheetIndex -1);

    //Reset variables
    isMouseDown = false,
        startRow = 0,
        startCol = 0,
        endRow = 0,
        endCol = 0;

    //FIXME: for some reason, calling this twice solves a problem where the column and column header widths are mis-aligned
    adjust_container_dimensions();
    adjust_container_dimensions();
    return false;
}

function copy_cells()
{

    var cells = $j('td.selected_cell');
    var columns = $j('.col_heading.selected_heading').size();
    var text = "";

    for(var i = 0; i < cells.size(); i += columns)
    {
        for(var j = 0; j < columns; j += 1)
        {
            text += (cells.eq(i + j).html() + "\t");
        }
        text += "\n";
    }

    $j("textarea#export_data").val(text);
    $j("div.spreadsheet_popup").hide();
    $j("div#export_form").show();
}

function changeRowsPerPage(){
    var current_href = window.location.href;
    if (current_href.endsWith('#'))
        current_href = current_href.substring(0,current_href.length-1);

    var update_per_page = $('per_page').value;
    var update_href = '';
    if (current_href.match('page_rows') == null){
        update_href = current_href.concat('&page_rows='+update_per_page);
    }else{
        var href_array = current_href.split('?');
        update_href = update_href.concat(href_array[0]);
        var param_array = [];
        if (href_array[1] != null){
            param_array = href_array[1].split('&');
            update_href = update_href.concat('?');
        }

        for (var i=0;i<param_array.length;i++){
            if(param_array[i].match('page_rows') == null){
                update_href = update_href.concat('&' + param_array[i]);
            }else{
                update_href = update_href.concat('&page_rows='+update_per_page);
            }
            //go to the first page
            if(param_array[i].match('page=') != null){
                update_href = update_href.concat('&page=1');
            }
        }
    }


    window.location.href = update_href;
}

// In the case of having pagination.
// To get the rows relatively to the page. E.g. minRow = 14, perPage = 10 => relativeMinRow = 4
function relativeRows(minRow, maxRow, sheetNumber){
    var current_page = null;
    if (sheetNumber != null)
        current_page = currentPage(sheetNumber);

    var relativeMinRow = minRow % perPage;
    var relativeMaxRow = maxRow % perPage;
    var minRowPage = parseInt(minRow/perPage) + 1;
    var maxRowPage = parseInt(maxRow/perPage) + 1;
    if (relativeMinRow == 0){
        relativeMinRow = perPage;
        minRowPage -=1;
    }
    if (relativeMaxRow == 0){
        relativeMaxRow = perPage;
        maxRowPage -=1;
    }

    //This is for the case of having minRow and maxRow in different pages.
    if (current_page != null && minRowPage < maxRowPage ){
        if (current_page == minRowPage){
            relativeMaxRow = perPage;
        }else if (current_page == maxRowPage){
            relativeMinRow = 1;
        }else if (current_page > minRowPage && current_page < maxRowPage){
            relativeMaxRow = perPage;
            relativeMinRow = 1;
        }
    }
    return [relativeMinRow, relativeMaxRow];
}

function displayRowsPerPage(){
    paginations = document.getElementsByClassName('pagination');
    if (paginations.length > 0){
        $('rows_per_page').show();
    }
}

/* Fetch XML --> convert to JSON --> add "selected" attribute to selected cells.
  - currently wb=0, because we only have one workbook each time. later when we combine different files, this should be changed.
  - for merging different files - can take a list of many objects:
      var super_json = merge_json_workbooks([json_obj, json_obj2]);
*/
function get_data(rb, cb) {
    if (rb == null) rb = -1;
    if (cb == null) cb = -1;
    console.log("get data rb, cb: ", rb, cb)

    var json_copy = JSON.parse(JSON.stringify(full_json_obj));
    json_obj = add_selected_to_json(json_copy, wb=0, row_labels=rb, col_labels=cb);
    var selected_json = iterate_on_rows(json_obj, get_selected_from_row);
    return selected_json;
}

function heatmap_plot(){
    var options = {cr: 0, hm_data: [], columns: {}, row_labels: 0, col_labels: 0};
    var selected_json = get_data(rb=options.row_labels, cb=options.col_labels);
    iterate_on_rows(selected_json, init_heatmap_row, add_col_titles_from_sheet, options);
    //var heatmap_data = init_heatmap_data(selected_json); //plotting_selected_cells();
    //draw_heatmap(heatmap_data);
    draw_heatmap(options.hm_data);
    $j('#heatmap_container').show();
    doUpdate();
}

function parallel_coord_plot(){
    // cr = cumulative rows across workbooks/sheets
    // not using row labels. compounds are not necessarily a part of the plot.
    var options = {cr: 0, pc_data: [], columns: {}, col_labels: 0, row_labels: -1};
    var selected_json = get_data(rb=options.row_labels, cb=options.col_labels);
    iterate_on_rows(selected_json, init_pc_row, add_col_titles_from_sheet, options);
    draw_parallel_coord(options.pc_data);
    $j('#parcoords_container').show();
    //doUpdate();
}

/*
  Read column labels from the row number specified in opt.col_labels
  Modify opt.columns ( = {col_alpha1: "title1", col_alpha2: "title2" ... }
  Note: opt.columns remains valid per sheet s, because it tracks according to column_alpha as a dictionary key.
 */

function add_col_titles_from_sheet(obj, w, s, opt) {
    var sheet_obj = obj["workbook"][w]["sheet"][s];
    opt.columns = {};
    var cb = opt.col_labels;
    //if (sheet_obj.rows.row[cb].cell.length > 0) {
    for (var c = 0; c < sheet_obj.rows.row[cb].cell.length; c++) {
        //actual excel sheet column index to avoid shifting of columns (B-->A) on partial selection of columns
        var col_i = sheet_obj.rows.row[cb].cell[c]["@column_alpha"];
        opt.columns[col_i] = sheet_obj.rows.row[cb].cell[c]["#text"];
    }
    //}
    console.log(opt.columns);
    return obj;
}

/* set up heat map data such that heatmap_data[row_i] = { col_label: .., row_label: .., row: .., col: .., value: ..}
 Note: the way d3_heatmap was programmed, it's easier to set up the cumulative rows from here. because  data.row will be accessed
*/
function init_heatmap_row(obj, w, s, r, opt) {
    sheet_obj = obj["workbook"][w]["sheet"][s];
    if (r != opt.col_labels) {
        if ((a=sheet_obj.rows.row[r].cell !== undefined) && (a=sheet_obj.rows.row[r].cell !== null)
            && (a=sheet_obj.rows.row[r].cell.length > 0)) {
            //opt.pc_data[opt.cr] = {}; //object initialization
            for (var c = 0; c < sheet_obj.rows.row[r].cell.length; c++) {
                var col_i = sheet_obj.rows.row[r].cell[c]["@column_alpha"];
                (opt.hm_data).push({
                    row_label: sheet_obj.rows.row[r].cell[opt.row_labels]["#text"],
                    col_label: (opt.columns[col_i] || ""),
                    sheet: sheet_obj["@name"],
                    row: opt.cr, //sheet_arr[s].rows.row[r]["@index"],
                    col: sheet_obj.rows.row[r].cell[c]["@column"],
                    col_alpha: sheet_obj.rows.row[r].cell[c]["@column_alpha"],
                    value: sheet_obj.rows.row[r].cell[c]["#text"]
                });
            }
            //if at least one cell in the row was not empty, advance cumulative row counter
            if (Object.keys(opt.hm_data[opt.cr]).length != 0)
                opt.cr++;
        }
    }
    return obj;
}

/* Set up parallel coordinates data, Array of Objects of length 0...#cr, such that
 parcoord_data[row_i][col_name] =  (parcoords_data[row_i] = {c1: v1, c2: v2 ...} )
 TO DO handle zero selections
 */

function init_pc_row(obj, w, s, r, opt) {
    //console.log("init pc row s, r: ", s, r);
    sheet_obj = obj["workbook"][w]["sheet"][s];
    if (r != opt.col_labels) {
        if ((a=sheet_obj.rows.row[r].cell !== undefined) && (a=sheet_obj.rows.row[r].cell !== null)
            &&(a=sheet_obj.rows.row[r].cell.length > 0)) {
            opt.pc_data[opt.cr] = {}; //object initialization
            for (var c = 0; c < sheet_obj.rows.row[r].cell.length; c++) {
                var col_i = sheet_obj.rows.row[r].cell[c]["@column_alpha"];
                opt.pc_data[opt.cr][opt.columns[col_i]] = sheet_obj.rows.row[r].cell[c]["#text"];
                 //console.log("c: ", c, "cr: ", opt.cr, "col_i", col_i, "col: ", opt.columns[col_i])
                 //console.log(opt.pc_data[opt.cr][opt.columns[col_i]])
            }
            //if at least one cell in the row was not empty, advance cumulative row counter
            if (Object.keys(opt.pc_data[opt.cr]).length != 0)
                opt.cr++;
        }
    }
    return obj;
}
