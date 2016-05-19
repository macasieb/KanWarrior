"use strict";

var parseXMLString = require('xml2js').parseString;
var nodefn = require('when/node');
var ical = require('ical');
var path = require('path');
var moment = require('moment');

function icalDateToISO(icalDate) {
    return icalDate.substring(0, 4) + "-" + icalDate.substring(4, 6) + "-" + icalDate.substring(6, 8) + "T" + icalDate.substring(9, 11) + ":" + icalDate.substring(11, 13) + ":" + icalDate.substring(13, 15) + "Z";
}

// parse calendar object
function parseCalendarMultistatus(xml) {

    return nodefn.call(parseXMLString, xml).then(function (result) {

        var parsed = {};

        if (!result['d:multistatus'] || !result['d:multistatus']['d:response']) {
            return parsed;
        }

        parsed.href = result['d:multistatus']['d:response'][0]['d:href'][0];
        parsed.name = result['d:multistatus']['d:response'][0]['d:propstat'][0]['d:prop'][0]['d:displayname'][0];
        parsed.ctag = result['d:multistatus']['d:response'][0]['d:propstat'][0]['d:prop'][0]['cs:getctag'][0];

        return parsed;
    });
}

// parse events
function parseEventsMultistatus(xml) {

    var parsed;
    var formatted = [];

    return nodefn.call(parseXMLString, xml).then(function (result) {

        if (!result['d:multistatus'] || !result['d:multistatus']['d:response']) {
            return formatted;
        }

        parsed = result['d:multistatus']['d:response'];

        // parse must not be undefined!
        parsed.forEach(function (event) {

            // fix etag string (renders as '"[...]"', ugly xml2js objects (pew pew)
            var etag = event['d:propstat'][0]['d:prop'][0]['d:getetag'][0];
            etag = etag.substring(1, etag.length);

            formatted.push({
                ics: event['d:href'][0],
                etag: etag
            });

        });

        return formatted;

    });
}

function parseEvents(xml) {

    var parsed;
    var formatted = [];
    var ical_events = ical.parseICS(xml);

    return nodefn.call(parseXMLString, xml).then(function (result) {

        if (!result['d:multistatus'] || !result['d:multistatus']['d:response']) return formatted;

        parsed = result['d:multistatus']['d:response'];

        parsed.forEach(function (event) {

            var etag = event['d:propstat'][0]['d:prop'][0]['d:getetag'][0];
            etag = etag.substring(1, etag.length);

            var data = {};
            var ical_event = ical_events[path.basename(event['d:href'][0], '.ics')];
            //console.log("ical: " + (JSON.stringify(ical_events, null, 4)));
            data.status = ical_event.status;
            data.priority = ical_event.priority;
            data.title = ical_event.summary;
            data.uid = ical_event.uid;
            data.due = ical_event.due;
            data.start = ical_event.start;
            data.end = ical_event.end;
            data.createdAt = ical_event.created;

            formatted.push({
                ics: event['d:href'][0],
                etag: etag,
                data: data
            });
        });

        return formatted;
    });
}

exports.parseEventsMultistatus = parseEventsMultistatus;
exports.parseCalendarMultistatus = parseCalendarMultistatus;
exports.parseEvents = parseEvents;