module.exports.lastcall = null
module.exports.lastInsertedDoc = null

const testrows = [
    {_id: 12345, attributes: {"test": "test"}},
    {_id: 12346, attributes: {"test": "test2"}}
]

const find = (queryParams) => {
    return {
        project: (project) => {
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
    }
}

module.exports.db = { collection: () => {

    return {
        find: find,
        findOne: async (query) => {
            module.exports.lastcall = {query: query}
            if (module.exports.lastInsertedDoc && module.exports.lastInsertedDoc._id === query._id) return module.exports.lastInsertedDoc
            return testrows.find((row) => row._id === query._id)
        },
        insertOne: (doc) => {
            module.exports.lastcall = {doc: doc}
            doc._id = "5da0180fb0c6dc53a0a83118"
            module.exports.lastInsertedDoc = doc
            return {acknowledged: true, insertedId: doc._id}
        },
        findOneAndUpdate: (query, params, options) => {
            module.exports.lastcall = {query: query, params: params, options: options}
            return {value: Object.assign({_id: query._id}, params["$set"])}
        }

    };
}}