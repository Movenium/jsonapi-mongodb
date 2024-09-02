
var mongo = require('mongodb');

module.exports.parsePath = (path) => {
    if (path.startsWith("/")) path = path.substring(1)
    return path.split("/")
}

module.exports.toDotFormat = (obj, branch) => {
    
    for (const key in obj[branch]) {
        obj[branch + "." + key] = obj[branch][key]
    }

    delete obj[branch]
}

/**
 * Search through every relation and if id seems to be mongo id replace it with new mongo.ObjectID
 */
module.exports.convertRelationsIdtoMongoId = (relations) => {
    for (const key in relations) {
        const relation = relations[key]

        if (!relation.data) continue
        if (!relation.data.id) continue

        const id = relation.data.id

        if (module.exports.testIsMongoId(id)) relation.data.id = new mongo.ObjectId(id)
    }
}

module.exports.tryToParseJson = (str) => {
    try {
        return JSON.parse(str)
    } catch (e) {
        return {}
    }
}

module.exports.testIsMongoId = (str) => {
    if (typeof str !== "string") return false
    return str.match(/^[a-f0-9]{24}$/) ? true : false
}

module.exports.parseServerlessComQueryParams = (params) => {
    const obj = {}

    for (const paramName in params) {
        paramValue = params[paramName]
        // if the paramName ends with square brackets, e.g. colors[] or colors[2]
        if (paramName.match(/\[([\w\.]+)?\]$/)) {

            // create key if it doesn't exist
            var key = paramName.replace(/\[([\w\.]+)?\]/, '');
            if (!obj[key]) obj[key] = [];

            // if it's an indexed array e.g. colors[2]
            if (paramName.match(/\[[\w\.]+\]$/)) {
                // get the index value and add the entry at the appropriate position
                var index = /\[([\w\.]+)\]/.exec(paramName)[1];
                obj[key][index] = paramValue;
            } else {
                // otherwise add the value to the end of the array
                obj[key].push(paramValue);
            }
        }
        else {
            obj[paramName] = paramValue
        }
    }

    return obj
}

module.exports.searchDateAndConvert = (obj) => {
    for (const key in obj) {
        if (module.exports.testIsDate(obj[key])) obj[key] = new Date(obj[key])        
    }
}

// TODO: more accurate
module.exports.testIsDate = (str) => {
    if (typeof str !== "string") return false
    return str.match(/^([12]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]))/) ? true : false
}

module.exports.testIsDateBetween = (str) => {
    if (typeof str !== "string") return false

    const splitted = str.split("_")
    if (splitted.length < 2) return false
    
    return module.exports.testIsDate(splitted[0]) && module.exports.testIsDate(splitted[1])
}

module.exports.convertMongoIdtoId = (doc) => {
    if (!doc) return
    doc.id = doc._id
    delete doc._id
    return doc
}

module.exports.get = function(object, path, notFound = "null") {

    if (!object) return null;

    const key = path.indexOf(".") !== -1 ? path.substr(0, path.indexOf('.')) : path;
    const rest = path.indexOf(".") !== -1 ? path.substr(path.indexOf('.') + 1) : null;

    //console.log("parse", path, key, rest, object)

    if (object[key] && rest !== null) {

        // if path hits on promise we resolve it and continue traversing further
        if (module.exports.isPromise(object[key])) {
            return new Promise((resolve, reject) => {
                object[key].then((resolved) => {
                    resolve(module.exports.get(resolved, rest))
                }, reject)
            })
        }

        return module.exports.get(object[key], rest);
    }
    else if (typeof object[key] !== "undefined") {
        return object[key];
    }
    else {
        //console.log("key", key, "was null")
        return notFound === "null" ? null : undefined
    }
}


module.exports.isPromise = function(object) {
    if (!object) return false
    if (typeof object !== "object") return false
    return typeof object.then === "function"
}

module.exports.parseQuery = function(queryString) {
    var query = {};
    var pairs = (queryString[0] === '?' ? queryString.substr(1) : queryString).split('&');
    for (var i = 0; i < pairs.length; i++) {
        var pair = pairs[i].split('=');
        query[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
    }
    return query;
}