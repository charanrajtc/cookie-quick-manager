/*
 *  Cookie Quick Manager: An addon to manage (view, search, create, edit,
 *  remove, backup, restore) cookies on Firefox.
 *  Copyright (C) 2017-2018 Ysard
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 *  Home: https://github.com/ysard/cookie-quick-manager
 */
// IIFE - Immediately Invoked Function Expression
(function(mycode) {

    // The global jQuery object is passed as a parameter
    mycode(window.jQuery, window.vAPI, window, document);

}(function($, vAPI, window, document) {

    // The $ is now locally scoped
    $(function () {

/*********** Events attached to UI elements ***********/
$("#modal_clipboard").on('shown.bs.modal', function () {
    // Capture the focus on textarea and select all its content
    // Event is triggered when the modal is fully shown (CSS transitions included)
    $('#clipboard_textarea').select();
});

/* Bug in FF ? see download().
 $ ("*#file_export").click(function() {
 download($('#domain').val() + ".txt", build_cookie_dump());
});
*/
$("#file_cookie_export").click(function() {
    export_content_to_file(get_concatenated_content(build_cookie_dump()));
});

$("#file_domain_export").click(function() {
    // Build 1 json template for each cookie for the selected domain
    let promise = vAPI.getCookiesFromSelectedDomain();
    promise.then((cookies) => {
        // Make 1 json for each cookie and store it
        // Merge and display templates
        export_content_to_file(get_concatenated_content(get_templates(cookies)));

    }, (error) => {
        // No cookie
        console.log({"error:": "No domain selected"});
    });
});

$("#file_all_export").click(function() {
    // Build 1 json template for each cookie in all stores
    let promise = vAPI.get_all_cookies([$('#search_store').val()]);
    promise.then((cookies) => {
        export_content_to_file(get_concatenated_content(get_templates(cookies)));
    });
});

$("#clipboard_cookie_export").click(function() {
    // Handle the copy of the current cookie displayed in details zone
    // Build text according to template
    $('#clipboard_textarea').val(get_concatenated_content(build_cookie_dump()));
    // Update title of the dialog box (1 only cookie at the time here)
    $('#modal_clipboard h4.modal-title').text("Export 1 cookie");
});

$("#clipboard_domain_export").click(function() {
    // Build 1 json template for each cookie for the selected domain
    let promise = vAPI.getCookiesFromSelectedDomain();
    display_json_in_clipboard_area(promise);
});

$("#clipboard_all_export").click(function() {
    // Build 1 json template for each cookie in all stores
    let promise = vAPI.get_all_cookies([$('#search_store').val()]);
    display_json_in_clipboard_area(promise);
});

$("#import_file").click(function(event) {
    // Overlay for <input type=file>
    var file_elem = document.getElementById("file_elem");
    if (file_elem) {
        file_elem.click();
    }
    event.preventDefault(); // prevent navigation to "#"
});

$("#file_elem").change(function(event) {
    // File load onto the browser
    var file = event.target.files[0];
    if (!file)
        return;

    var reader = new FileReader();
    reader.onload = function(event) {
        // Restore content
        handleUploadedFile(event.target.result);
    };
    reader.readAsText(file);
});

browser.storage.onChanged.addListener(function (changes, area) {
    // Called when the local storage area is modified
    // Here: we handle only 'template' key.

    //console.log("Change in storage area: " + area);
    console.log(changes);
    // Reload template
    if (changes.template !== undefined) {
        cookie_clipboard_template = vAPI.templates[changes.template.newValue];
    }
});

/*********** Initializations ***********/

get_options();

});

/*********** Utils ***********/
function get_concatenated_content(templates) {
    // Return string from array of strings
    // According to the current template,
    // make 1 json for each cookie and store it or,
    // return 1 text content with 1 cookie per line.
    return cookie_clipboard_template.left_tag +
        templates.join(cookie_clipboard_template.separator) +
        cookie_clipboard_template.right_tag;
}

function get_templates(cookies) {
    // Return array of templates (strings); 1 for each cookie in the given array
    // Make 1 template for each cookie and store it
    var templates = [];
    for (let cookie of cookies) {
        // Build a template for the current cookie
        templates.push(build_domain_dump(cookie));
    }
    return templates;
}

function secure_string(unescaped_string) {
    // Escape double quotes and backslashs only for JSON template
    if (cookie_clipboard_template.name == 'JSON')
        return unescaped_string.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    else if (cookie_clipboard_template.name == 'NETSCAPE')
        return unescaped_string;
    return unescaped_string;
}

function display_json_in_clipboard_area(cookies_promise) {
    // Fill the textarea with the cookies in the given promise

    cookies_promise.then((cookies) => {
        // Make 1 json for each cookie
        var templates = get_templates(cookies);
        // Merge and display templates, update title with the number of cookies
        $('#clipboard_textarea').val(get_concatenated_content(templates));
        // Count cookies displayed (not subdomains filtered)
        let content = browser.i18n.getMessage("modalClipboardTitle", templates.length);
        $('#modal_clipboard h4.modal-title').text(content);

    }, (error) => {
        // No cookie
        $('#clipboard_textarea').val('');
        $('#modal_clipboard h4.modal-title').text("Export 0 cookie");
    });
}

function build_cookie_dump() {
    // Return the updated template according to the selected cookie in cookie-list,
    // displayed in details.
    // Data: from the User Interface.

    function get_timestamp(raw) {
        // If raw is true, return the unix timestamp if the cookie is not a session cookie
        // otherwise, return 0.
        // If raw is false, return human readable date or "At the end of the session" for a
        // session cookie.
        var issession = $('#issession').is(':checked');
        if (raw) {
            return (!issession) ? $('#expiration_date').data("DateTimePicker").date().unix() : 0;
        }
        return (!issession) ? $('#expiration_date').data("DateTimePicker").date().format(vAPI.date_format) : "At the end of the session";
    }

    function get_domain_status(raw) {
        // Return the domain status of cookie.
        // If raw is true, return false is cookie is valid for subdomains
        // If raw is false, return "Valid for subdomains" or "Valid for host only".
        // PS:
        //   foo.com => host-only
        //   .foo.com => subdomains
        //   www.foo.com => host-only
        var domain = $('#domain').val();
        if (raw) {
            // Return false if cookie is also valid for subdomains
            return (domain[0] == '.') ? false : true;
        }
        return (domain[0] == '.') ? "Valid for subdomains" : "Valid for host only";
    }

    function get_secure_status(raw) {
        // Return the secure status of the cookie
        // If raw is true, return true or false
        var issecure = $('#issecure').is(':checked');
        if (raw) {
            return issecure;
        }
        return (issecure) ? "Encrypted connections only" : "Any type of connection";
    }

    // Make a local copy of the template
    var template_temp = cookie_clipboard_template.template;

    // Update variables
    var params = {
        '{HOST_RAW}': vAPI.getHostUrl_from_UI(),
        '{DOMAIN_RAW}': $('#domain').val(),
        '{NAME_RAW}': secure_string($('#name').val()),
        '{PATH_RAW}': $('#path').val(),
        '{CONTENT_RAW}': secure_string($('#value').val()),
        '{EXPIRES}': get_timestamp(false),
        '{EXPIRES_RAW}': get_timestamp(true),
        '{ISSECURE}': get_secure_status(false),
        '{ISSECURE_RAW}': get_secure_status(true),
        '{ISHTTPONLY_RAW}': $('#httponly').is(':checked'),
        '{ISDOMAIN}': get_domain_status(false),
        '{ISDOMAIN_RAW}': get_domain_status(true),
        '{STORE_RAW}': $('#store').val(),
    };

    // Replace variables in template
    for (let key_pattern in params) {
        template_temp = template_temp.replace(key_pattern, params[key_pattern]);
    }
    return new Array(template_temp);
    //return JSON.stringify(JSON.parse(template_temp), null, 2);
}

function build_domain_dump(cookie) {
    // Return the updated template according to the given cookie object.
    // Data: from the given cookie object.

    function get_timestamp(raw) {
        // If raw is true, return the unix timestamp if the cookie is not a session cookie
        // otherwise, return 0.
        // If raw is false, return human readable date or "At the end of the session" for a
        // session cookie.
        if (raw) {
            return (!cookie.session) ? cookie.expirationDate : 0;
        }
        return (!cookie.session) ? moment(new Date(cookie.expirationDate * 1000)).format(vAPI.date_format) : "At the end of the session";
    }

    function get_domain_status(raw) {
        // Return the domain status of cookie.
        // If raw is true, return false is cookie is valid for subdomains
        // If raw is false, return "Valid for subdomains" or "Valid for host only".
        // PS:
        //   foo.com => host-only
        //   .foo.com => subdomains
        //   www.foo.com => host-only
        if (raw) {
            // Return false if cookie is also valid for subdomains
            return cookie.httpOnly;
        }
        return (cookie.httpOnly) ? "Valid for subdomains" : "Valid for host only";
    }

    function get_secure_status(raw) {
        // Return the secure status of the cookie
        // If raw is true, return true or false
        if (raw) {
            return cookie.secure;
        }
        return (cookie.secure) ? "Encrypted connections only" : "Any type of connection";
    }

    // Make a local copy of the template
    var template_temp = cookie_clipboard_template.template;

    var params = {
        '{HOST_RAW}': vAPI.getHostUrl(cookie),
        '{DOMAIN_RAW}': cookie.domain,
        '{NAME_RAW}': secure_string(cookie.name),
        '{PATH_RAW}': cookie.path,
        '{CONTENT_RAW}': secure_string(cookie.value),
        '{EXPIRES}': get_timestamp(false),
        '{EXPIRES_RAW}': get_timestamp(true),
        '{ISSECURE}': get_secure_status(false),
        '{ISSECURE_RAW}': get_secure_status(true),
        '{ISHTTPONLY_RAW}': cookie.httpOnly,
        '{ISDOMAIN}': get_domain_status(false),
        '{ISDOMAIN_RAW}': cookie.hostOnly,
        '{STORE_RAW}': cookie.storeId,
    };

    // Replace variables in template
    for (let key_pattern in params) {
        template_temp = template_temp.replace(key_pattern, params[key_pattern]);
    }
    return template_temp;
}

function download(filename, text) {
    /* bug for Firefox in panel ?
     * This file is opened in place of the current window instead of downloaded...
     * TODO: This function can be replaced with an iframe like in the event:
     * $("#file_export").click(function() ...
     */
    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
}

function export_content_to_file(content) {
    // Due do FF bug (cf download() function)
    // We have to create an iframe to propose a file to the user
    var f = document.createElement('iframe');
    f.style.position = 'fixed';
    f.style.left = f.style.top = '-99px';
    //f.style.width = f.style.height = '99px';
    f.srcdoc = '<a download="cookies.json" target="_blank">cookies.json</a>';
    f.onload = function() {
        var blob = new Blob([content], {type: 'application/json'});
        var a = f.contentDocument.querySelector('a');
        a.href = f.contentWindow.URL.createObjectURL(blob);
        a.click();
        // Removing the frame document implicitly revokes the blob:-URL too.
        setTimeout(function() { f.remove(); }, 2000);
    };
    document.body.appendChild(f);
}

function onError(error) {
    // Function called when a save/remove function has failed by throwing an exception.
    console.log({"Error removing/saving cookie:": error});
    set_info_text(browser.i18n.getMessage("cookieRestoredError", error));
}

function handleUploadedFile(content) {
    // Take a file content and dispatch it to the good parser
    parseJSONFile(content);
}

function parseJSONFile(content) {
    // Parse json file and return a cookie object

    try {
        // Throw SyntaxError if JSON is not correctly formatted
        var json_content = JSON.parse(content);
    } catch (error) {
        if (error instanceof SyntaxError) {
            console.log(error);
            set_info_text(browser.i18n.getMessage("cookieRestoredError", error));
        } else {
            throw error;
        }
        $('#modal_info').modal('show');
        return;
    }

    // Build cookies
    let promises = [];
    for (let json_cookie of json_content) {
        let params = {
            url: json_cookie["Host raw"],
            name: json_cookie["Name raw"],
            value: json_cookie["Content raw"],
            path: json_cookie["Path raw"],
            httpOnly: (json_cookie["HTTP only raw"] === 'true'),
            secure: (json_cookie["Send for raw"] === 'true'),
            storeId: (json_cookie["Private raw"]  === 'true') ? 'firefox-private' : 'firefox-default',
        };

        if (json_cookie["Store raw"] !== undefined) {
            params['storeId'] = json_cookie["Store raw"];
        }

        // Session cookie has no expiration date
        if (json_cookie["Expires raw"] != "0") {
            let expirationDate = parseInt(json_cookie["Expires raw"], 10);
            if (expirationDate <= ((Date.now() / 1000|0) + 1))
                continue;
            params['expirationDate'] = expirationDate;
        }
        console.log(params);
        promises.push(browser.cookies.set(params));
    }

    // Handle import_protected_cookies global option
    let get_settings = browser.storage.local.get({
        import_protected_cookies: false
    });
    get_settings.then((items) => {
        console.log(items);
        add_cookies(promises, items.import_protected_cookies);
    });

}

function add_cookies(new_cookies_promises, import_protected_cookies) {
    // Get promises to set new cookies and import_protected_cookies as a global
    // flag to protect these new cookies from deletion.

    let add_promise = new Promise((resolve, reject) => {

        Promise.all(new_cookies_promises).then((cookies_array) => {
            // Iter on all results of promises
            for (let added_cookie of cookies_array) {

                // If null: no error but no save
                if (added_cookie === null) {
                    console.log({"Not added": added_cookie});
                    reject("Cookie " + JSON.stringify(added_cookie) + " can't be saved");
                }
                console.log({"Added": added_cookie});
            }

            // Protect all cookies if asked in global settings
            if (import_protected_cookies)
                vAPI.set_cookie_protection(cookies_array, true);

            // Ok => all cookies are added properly
            // Reactivate the interface
            resolve();
        }, onError);
    });

    add_promise.then((ret) => {
        // Display modal info
        set_info_text(browser.i18n.getMessage("cookieRestoredSuccess"));
        // Actualize interface
        $("#actualize_button").click();
        $('#modal_info').modal('show');

    }, (error) => {
        console.log({AddError: error});
        set_info_text(browser.i18n.getMessage("cookieRestoredSingleError", error));
        // If null: no error but no save
        $("#actualize_button").click();
        $('#modal_info').modal('show');
    });
}

function set_info_text(content) {
    $('#info_text').text(content);
}

function get_options() {
    // Get options from storage
    // Init cookie_clipboard_template array in global context

    let get_settings = browser.storage.local.get({
        template: 'JSON',
    });
    get_settings.then((items) => {
        //console.log({storage_data: items});
        cookie_clipboard_template = vAPI.templates[items.template];
    });
}


var cookie_clipboard_template;

}));
