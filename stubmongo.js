
module.exports.lastcall = null

const testrows = [
    {_id: 12345, attributes: {"test": "test"}},
    {_id: 12346, attributes: {"test": "test2"}}
]

const find = (queryParams) => {
    return {
        sort: (sort) => {
            return {
                skip: (skip) => {
                    return {
                        limit: (limit) => {
                            return {
                                toArray: () => {
                                    module.exports.lastcall = {queryParams: queryParams, skip: skip, limit: limit}
                                    return testrows
                                }
                            }
                        }
                    }    
                }
            }
        }
    }
}

module.exports.db = { collection: () => {

    return {
        find: find,
        insertOne: (doc) => {
            module.exports.lastcall = {doc: doc}
            doc._id = "5da0180fb0c6dc53a0a83118"
            return {ops: [doc]}
        },
        findOneAndUpdate: (query, params, options) => {
            module.exports.lastcall = {query: query, params: params, options: options}
            return {value: Object.assign({_id: query._id}, params["$set"])}
        }

    };
}}