
/* Input: json object, reference to worksheet w, sheet s and row r + options (currently unused)
   Returns: json object modified to contain only the "selected" cells from row r
 */
function get_selected_from_row(json_obj, w ,s ,r, options) {
    //if (options == null) options = {};
    var one_row = json_obj["workbook"][w]["sheet"][s].rows.row[r];
   // console.log(one_row.cell);
    if ((a=one_row.cell !== undefined) && (a=one_row.cell !== null)) {
        var cell_arr_len = json_obj["workbook"][w]["sheet"][s].rows.row[r].cell.length - 1;
        //descending order to enable quick and painless deletions.
        for (var c = cell_arr_len; c > -1; c--) {
            if (!(json_obj["workbook"][w]["sheet"][s].rows.row[r].cell[c]["@selected"])) {
                //console.log("removing in workbook, sheet, row, cell", w, s, r, c)
                json_obj["workbook"][w]["sheet"][s].rows.row[r].cell.splice(c, 1);
            }
        }
    }
    return json_obj;
}

/*  function iterate_on_rows(json_obj, callback)
    Input: json object, options, function rowAction
    iterates on the json object (workkbook --> sheet --> row) and execute callback for each row.
    - callback works on the object itself with indices w,s,r (workbook, sheet, row), rather than a row object
      because the indices could point to other features in the sheet except the row which may become important later on.
 */
function iterate_on_rows(json_obj, row_callback, sheet_callback, options) {
    if (options == null) options = {};
    if ((workbook_arr = json_obj["workbook"]) != null) {
        var sheet_arr = [];
        //Workbook objects loop
        for (var w = 0; w < workbook_arr.length; w++) {
            if ((sheet_arr = workbook_arr[w]["sheet"]) != null) {
//                if ((sheet_arr[s]["@hidden"] == "false") && (sheet_arr[s]["@very_hidden"] == "false")) {
                    //Sheet objects loop
                for (var s =0; s<sheet_arr.length; s++) {
                    if (sheet_arr[s].rows.row != null) {
                        if (typeof sheet_callback === 'function') {
                            json_obj = sheet_callback(json_obj, w, s, options);
                        }
                        //Rows loop 1
                        for (var r = 0 ; r < sheet_arr[s].rows["@last_row"]; r++) {
                            //console.log("calling callback with: ", json_obj, w, s, r, options)
                            if (typeof row_callback === 'function') {
                                json_obj = row_callback(json_obj, w,s,r, options);
                            }
                        }
                    }
                }
            }
        }
    }
    return json_obj;
}
//
// function get_json_col(obj, w,s,r,c) {
//     return obj["workbook"][w]["sheet"][s].rows.row[r].cell[c];
// }
//
// function get_json_row(obj, w,s,r) {
//     return obj["workbook"][w]["sheet"][s].rows.row[r];
// }

function json_col_exists(obj, w,s,r,c) {
    return ( (obj["workbook"][w]["sheet"][s].rows.row[r].cell[c] != undefined) &&
             (obj["workbook"][w]["sheet"][s].rows.row[r].cell[c]["#text"] != undefined));
}

function json_row_exists(obj, w,s,r) {
    return (obj["workbook"][w]["sheet"][s].rows.row[r] != undefined);
}

// function json_col_attr_exists(obj, w,s,r,c, attr) {
//     return obj["workbook"][w]["sheet"][s].rows.row[r].cell[c][attr] != undefined;
// }

function set_json_col_attr(obj, w,s,r,c, attr, val) {
    obj["workbook"][w]["sheet"][s].rows.row[r].cell[c][attr] = val;
    return obj;
}

// function iterate_on_cells(json_obj, w, s ,r) {
//     for (var c = 0; c < json_obj["workbook"][w]["sheet"][s].rows.row[r].cell.length; c++) {
//
//     }
// }

/*
 Input: json object, workbook number,
        col_labels = N, to represent which row should be chosen as a column labels row. (-1 if none should be chosen)
        row_label = N, to represent which col should be chosen as row labels column (-1 if none)
 Output: json_object with added "selected" attributes on cells
 */
function add_selected_to_json(json, wb, row_labels, col_labels) {
    if (wb == null ) wb=0;
    if (row_labels == null) row_labels = -1;
    if (col_labels == null) col_labels = -1;
    var selected = $j(".selected_cell");
    for (var sel=0; sel<selected.length; sel++) {
        var row = selected[sel].attributes.row.value-1;
        var col = selected[sel].attributes.col.value-1;
        var sheet = selected[sel].ancestors()[3].id.split('_')[1]-1;
        if ( json_row_exists(json, wb, sheet, row)  && json_col_exists(json, wb, sheet, row, col) ) {
            json = set_json_col_attr(json, wb, sheet, row, col, "@selected", "1");
            //select column which provides row labels specifically for 'row', row existence was already checked for
            if (row_labels > -1 && json_col_exists(json,  wb, sheet, row,  row_labels))  {
                json = set_json_col_attr(json, wb, sheet, row, row_labels, "@selected", "1");
                //json_obj["workbook"][wb]["sheet"][sheet].rows.row[row].cell[row_labels]["@selected"] = "1";
            }
            //select row that provides col labels, need to check for both row and col existence.
            if (col_labels > -1 && json_row_exists(json, wb, sheet, col_labels)
                                && json_col_exists(json, wb, sheet, col_labels, col)) {
                json = set_json_col_attr(json, wb, sheet, col_labels, col, "@selected", "1");
            }
        }
        //if row_labels column was not actively selected, the row_labels column-title needs to be cherry-picked
        if (row_labels > -1 && col_labels > -1 && json_row_exists(json, wb, sheet, col_labels) &&
            json_col_exists(json, wb, sheet, col_labels, row_labels) ) {
            json = set_json_col_attr(json, wb,  sheet, col_labels, row_labels, "@selected", "1");
        }
    }
    return json;
}


/*
 Merge JSON objects
 Input: array of JSON objects with workbook as top level
        obj = {workbook: [...]}
 Output: merged json object with the joint array of workbooks
 */
function merge_json_workbooks(json_wb_obj_array) {
    var super_obj = [];
    for (var i in json_wb_obj_array) {
        if (json_wb_obj_array[i]["workbook"] != null)
            super_obj = super_obj.concat(json_wb_obj_array[i]["workbook"]);
    }
    return {workbook: super_obj};
}

/*
 GET XML data file
  TO DO: worry about credentials?
 */
function get_xml_file(url) {
    var connect;
    if (window.XMLHttpRequest) connect = new XMLHttpRequest(); 		// all browsers except IE
    else connect = new ActiveXObject("Microsoft.XMLHTTP"); 		// for IE

    /* (async: false) makes it a synchronous request, bringing up a warning (deprecated).
       (async: true) fails because we don't get the answer on time.
       in principle works if all request-dependent actions were done here, by defining:
       connect.onreadystatechange = function() {
            if (connect.readyState === 4 && connect.status === 200) {
              //do everything
            .....} }; (essentially forcing it to be synchronious)
        but currently, plotting is done outside, and we need to wait.
    */
    connect.open('GET', url, false); //async: false
    connect.setRequestHeader("Content-Type", "text/xml");
    connect.send(null);
    if (connect.readyState === 4 && connect.status === 200) {
        var xmlDocument = connect.responseXML;
        return xmlDocument;
    } else {
        console.log("Error in getting XML file, readyState, status: ", connect.readyState, connect.status);
    }

}

/*
 Other functions expect all sheets to be in a sheet array under workbook.
 If there is only one sheet, the array might not exist and instead we get a single sheet object.
*/
function fix_sheet_in_json(json_obj) {
    console.log(json_obj);
    var sheets = json_obj["sheet"];
    if (! Array.isArray(sheets)) {
        json_obj["sheet"] = [sheets];
    }
    return json_obj;
}
//http://goessner.net/download/prj/jsonxml/
/*	This work is licensed under Creative Commons GNU LGPL License.

 License: http://creativecommons.org/licenses/LGPL/2.1/
 Version: 0.9
 Author:  Stefan Goessner/2006
 Web:     http://goessner.net/
 */
function xml2json(xml, tab) {
    var X = {
        toObj: function(xml) {
            var o = {};
            if (xml.nodeType==1) {   // element node ..
                if (xml.attributes.length)   // element with attributes  ..
                    for (var i=0; i<xml.attributes.length; i++)
                        o["@"+xml.attributes[i].nodeName] = (xml.attributes[i].nodeValue||"").toString();
                if (xml.firstChild) { // element has child nodes ..
                    var textChild=0, cdataChild=0, hasElementChild=false;
                    for (var n=xml.firstChild; n; n=n.nextSibling) {
                        if (n.nodeType==1) hasElementChild = true;
                        else if (n.nodeType==3 && n.nodeValue.match(/[^ \f\n\r\t\v]/)) textChild++; // non-whitespace text
                        else if (n.nodeType==4) cdataChild++; // cdata section node
                    }
                    if (hasElementChild) {
                        if (textChild < 2 && cdataChild < 2) { // structured element with evtl. a single text or/and cdata node ..
                            X.removeWhite(xml);
                            for (var n=xml.firstChild; n; n=n.nextSibling) {
                                if (n.nodeType == 3)  // text node
                                    o["#text"] = X.escape(n.nodeValue);
                                else if (n.nodeType == 4)  // cdata node
                                    o["#cdata"] = X.escape(n.nodeValue);
                                else if (o[n.nodeName]) {  // multiple occurence of element ..
                                    if (o[n.nodeName] instanceof Array)
                                        o[n.nodeName][o[n.nodeName].length] = X.toObj(n);
                                    else
                                        o[n.nodeName] = [o[n.nodeName], X.toObj(n)];
                                }
                                else  // first occurence of element..
                                    o[n.nodeName] = X.toObj(n);
                            }
                        }
                        else { // mixed content
                            if (!xml.attributes.length)
                                o = X.escape(X.innerXml(xml));
                            else
                                o["#text"] = X.escape(X.innerXml(xml));
                        }
                    }
                    else if (textChild) { // pure text
                        if (!xml.attributes.length)
                            o = X.escape(X.innerXml(xml));
                        else
                            o["#text"] = X.escape(X.innerXml(xml));
                    }
                    else if (cdataChild) { // cdata
                        if (cdataChild > 1)
                            o = X.escape(X.innerXml(xml));
                        else
                            for (var n=xml.firstChild; n; n=n.nextSibling)
                                o["#cdata"] = X.escape(n.nodeValue);
                    }
                }
                if (!xml.attributes.length && !xml.firstChild) o = null;
            }
            else if (xml.nodeType==9) { // document.node
                o = X.toObj(xml.documentElement);
            }
            else
                alert("unhandled node type: " + xml.nodeType);
            return o;
        },
        toJson: function(o, name, ind) {
            var json = name ? ("\""+name+"\"") : "";
            if (o instanceof Array) {
                for (var i=0,n=o.length; i<n; i++)
                    o[i] = X.toJson(o[i], "", ind+"\t");
                json += (name?":[":"[") + (o.length > 1 ? ("\n"+ind+"\t"+o.join(",\n"+ind+"\t")+"\n"+ind) : o.join("")) + "]";
            }
            else if (o == null)
                json += (name&&":") + "null";
            else if (typeof(o) == "object") {
                var arr = [];
                for (var m in o)
                    arr[arr.length] = X.toJson(o[m], m, ind+"\t");
                json += (name?":{":"{") + (arr.length > 1 ? ("\n"+ind+"\t"+arr.join(",\n"+ind+"\t")+"\n"+ind) : arr.join("")) + "}";
            }
            else if (typeof(o) == "string")
                json += (name&&":") + "\"" + o.toString() + "\"";
            else
                json += (name&&":") + o.toString();
            return json;
        },
        innerXml: function(node) {
            var s = ""
            if ("innerHTML" in node)
                s = node.innerHTML;
            else {
                var asXml = function(n) {
                    var s = "";
                    if (n.nodeType == 1) {
                        s += "<" + n.nodeName;
                        for (var i=0; i<n.attributes.length;i++)
                            s += " " + n.attributes[i].nodeName + "=\"" + (n.attributes[i].nodeValue||"").toString() + "\"";
                        if (n.firstChild) {
                            s += ">";
                            for (var c=n.firstChild; c; c=c.nextSibling)
                                s += asXml(c);
                            s += "</"+n.nodeName+">";
                        }
                        else
                            s += "/>";
                    }
                    else if (n.nodeType == 3)
                        s += n.nodeValue;
                    else if (n.nodeType == 4)
                        s += "<![CDATA[" + n.nodeValue + "]]>";
                    return s;
                };
                for (var c=node.firstChild; c; c=c.nextSibling)
                    s += asXml(c);
            }
            return s;
        },
        escape: function(txt) {
            return txt.replace(/[\\]/g, "\\\\")
                .replace(/[\"]/g, '\\"')
                .replace(/[\n]/g, '\\n')
                .replace(/[\r]/g, '\\r');
        },
        removeWhite: function(e) {
            e.normalize();
            for (var n = e.firstChild; n; ) {
                if (n.nodeType == 3) {  // text node
                    if (!n.nodeValue.match(/[^ \f\n\r\t\v]/)) { // pure whitespace text node
                        var nxt = n.nextSibling;
                        e.removeChild(n);
                        n = nxt;
                    }
                    else
                        n = n.nextSibling;
                }
                else if (n.nodeType == 1) {  // element node
                    X.removeWhite(n);
                    n = n.nextSibling;
                }
                else                      // any other node
                    n = n.nextSibling;
            }
            return e;
        }
    };
    if (xml.nodeType == 9) // document node
        xml = xml.documentElement;

    return fix_sheet_in_json(X.toObj(X.removeWhite(xml)));
    //the following will return a json string
    //var json = X.toJson(X.toObj(X.removeWhite(xml)), xml.nodeName, "\t");
    //return "{\n" + tab + (tab ? json.replace(/\t/g, tab) : json.replace(/\t|\n/g, "")) + "\n}";
}

// Converts XML to JSON
// shorter and cleaner - but need to change it to remove empty text elements.
//var jsonText = JSON.stringify(xmlToJson(xmlDoc));
function xmlToJson(xml) {

    // Create the return object
    var obj = {};

    if (xml.nodeType == 1) { // element
        // do attributes
        if (xml.attributes.length > 0) {
            obj["@attributes"] = {};
            for (var j = 0; j < xml.attributes.length; j++) {
                var attribute = xml.attributes.item(j);
                obj["@attributes"][attribute.nodeName] = attribute.nodeValue;
            }
        }
    } else if (xml.nodeType == 3) { // text
        obj = xml.nodeValue;
    }

    // do children
    if (xml.hasChildNodes()) {
        for(var i = 0; i < xml.childNodes.length; i++) {
            var item = xml.childNodes.item(i);
            var nodeName = item.nodeName;
            if (typeof(obj[nodeName]) == "undefined") {
                obj[nodeName] = xmlToJson(item);
            } else {
                if (typeof(obj[nodeName].push) == "undefined") {
                    var old = obj[nodeName];
                    obj[nodeName] = [];
                    obj[nodeName].push(old);
                }
                obj[nodeName].push(xmlToJson(item));
            }
        }
    }
    return obj;
}
