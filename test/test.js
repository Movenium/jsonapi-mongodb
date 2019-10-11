var assert = require('assert');
var stubmongo = require("../stubmongo")


let api

describe('Test Routes', function() {

  before(function() {
    api = new (require('../api'))(null, null, {
        authorizer: "partnerid"
    })

    api.connect = async function() {
        this.connection = {
          close: () => {
            assert.ok(true, "connection is closed")
          }
        }
        this.db = stubmongo.db

        this.connected = true
    }

    api.claims = {"partnerid": "testpartnerid"}
  });

  describe('Querying database', function() {
    it('test all the query params are used when fetching data', async function() {
      
      const response = await api.query("test", {filter: {"attributes.test": "test"}})

      assert.equal(response.length, 2, "Correct amount of rows returned")
      assert.equal(response[0].id, 12345, "Database id is changed from _id to id")

      assert.equal(stubmongo.lastcall.queryParams["meta.status"]["$ne"], "removed", "Removed rows are filtered")
      assert.equal(stubmongo.lastcall.queryParams["attributes.test"], "test", "Filter parameter is used")
      assert.equal(stubmongo.lastcall.queryParams["meta.authorizer.partnerid"], "testpartnerid", "Authorizer is included")
    });

    it('test inserting rows', async function() {

      const response = await api.post("test", {attributes: {"test": "test"}})

      assert.equal(response.id, "5da0180fb0c6dc53a0a83118", "Database id is changed from _id to id")
      assert.equal(response.meta.authorizer.partnerid, "testpartnerid", "Authorizer is added")
      assert.equal(response.attributes.test, "test", "Attributes still found")
      assert.ok(response.meta.created, "Creation datetime added")
      
    })

    it('test editing row', async function() {

      const response = await api.patch("test", "5da0180fb0c6dc53a0a83118", {attributes: {"test": "test"}})

      assert.equal(response.id, "5da0180fb0c6dc53a0a83118", "Database id is changed from _id to id")
      assert.equal(stubmongo.lastcall.query["meta.authorizer.partnerid"], "testpartnerid", "Authorizer is used in patch")
      assert.equal(stubmongo.lastcall.query._id, "5da0180fb0c6dc53a0a83118", "Only the correct doc is modified")

      assert.equal(stubmongo.lastcall.params["$set"]["attributes.test"], "test", "Set is changed to dot format")
      assert.ok(stubmongo.lastcall.params["$set"]["meta.modified"], "Modified timestamp is added/modified")
      
    })

    it('test quering with serverless.com event', async function() {
      const response = await api.serverlessComEvent({
        httpMethod: "get",
        path: "test",
        queryStringParameters: {"filter[attributes.test]": "test"},
        headers: {Authorization: "Bearer jwttoken"}
      })

      assert.equal(response.statusCode, 200, "status code given")
      assert.equal(JSON.parse(response.body).data.length, 2, "Body is formatted as json and contains two rows")
      
      assert.equal(stubmongo.lastcall.queryParams["meta.status"]["$ne"], "removed", "Removed rows are filtered")
      assert.equal(stubmongo.lastcall.queryParams["attributes.test"], "test", "Filter parameter is used")
      assert.equal(stubmongo.lastcall.queryParams["meta.authorizer.partnerid"], "testpartnerid", "Authorizer is included")
      
    })
  });

});