var assert = require('assert');
var stubmongo = require("../stubmongo")


let api

describe('Test Routes', function() {

  before(function() {
    api = new (require('../api'))(null, null, {
        authorizer: "partnerid",
        authentication: new (require('../authentication'))()
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

    it('test fetching with id', async function() {
      
      const response = await api.query("test", {filter: {"id": "5da0180fb0c6dc53a0a83118"}})
      assert.equal(stubmongo.lastcall.queryParams["_id"].toString(), "5da0180fb0c6dc53a0a83118", "Id filter is changed to _id and convert to mongoid")
    });

    it('test fetching with multi relationships', async function() {
      
      const response = await api.query("test", {filter: {"relationships.test.data.id": "123,124"}})
      assert.equal(JSON.stringify(stubmongo.lastcall.queryParams["relationships.test.data.id"]), "{\"$in\":[\"123\",\"124\"]}", "relationships are searched with $in")
    });

    it('test fetching relationship with mongoid', async function() {
      
      const response = await api.query("test", {filter: {"relationships.test.data.id": "5da0180fb0c6dc53a0a83118"}})
      assert.equal(stubmongo.lastcall.queryParams["relationships.test.data.id"].toString(), "5da0180fb0c6dc53a0a83118", "relationship mongoid string is converted to mongoid")
    });

    it('test fetching with date', async function() {
      
      const response = await api.query("test", {filter: {"attributes.date": "2020-01-01"}})
      assert.equal(JSON.stringify(stubmongo.lastcall.queryParams["attributes.date"]), '{"$gte":"2020-01-01T00:00:00.000Z","$lte":"2020-01-01T23:59:59.999Z"}', "single date search is converted to $gte $lte")
    });

    it('test fetching with date between', async function() {
      
      const response = await api.query("test", {filter: {"attributes.date": "2020-01-01_2020-01-31"}})
      assert.equal(JSON.stringify(stubmongo.lastcall.queryParams["attributes.date"]), '{"$gte":"2020-01-01T00:00:00.000Z","$lte":"2020-01-31T23:59:59.999Z"}', "date between search is converted to $gte $lte")
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
        pathParameters: {collection: "test"},
        queryStringParameters: {"filter[attributes.test]": "test"},
        headers: {Authorization: "Bearer jwttoken"}
      })

      assert.equal(response.statusCode, 200, "status code given")
      assert.equal(JSON.parse(response.body).data.length, 2, "Body is formatted as json and contains two rows")
      
      assert.equal(stubmongo.lastcall.queryParams["meta.status"]["$ne"], "removed", "Removed rows are filtered")
      assert.equal(stubmongo.lastcall.queryParams["attributes.test"], "test", "Filter parameter is used")
      assert.equal(stubmongo.lastcall.queryParams["meta.authorizer.partnerid"], "testpartnerid", "Authorizer is included")
      
    })

    it('test password is hashed', async function() {
      const response = await api.post("test", {attributes: {"password": "test"}})

      assert.equal(response.attributes.password.substring(0, 7), "$2b$10$", "Password is hashed")
      
    })

    it('test password is hashed in edit', async function() {
      const response = await api.patch("test", "5da0180fb0c6dc53a0a83118", {attributes: {"password": "test"}})
     
      assert.equal(stubmongo.lastcall.params["$set"]["attributes.password"].substring(0, 7), "$2b$10$", "Password is hashed")
      
    })

    it('test password is not hashed if it is hashed already', async function() {
      const response = await api.patch("test", "5da0180fb0c6dc53a0a83118", {attributes: {"password": "$2b$10$vCWOIzay6OQ8ho8D051Y5.tV1ZKzO4sJr5PHrAC1roiaA64DMMq9O"}})
     
      assert.equal(stubmongo.lastcall.params["$set"]["attributes.password"], "$2b$10$vCWOIzay6OQ8ho8D051Y5.tV1ZKzO4sJr5PHrAC1roiaA64DMMq9O", "Password is not hashed twice")
      
    })
  });

});