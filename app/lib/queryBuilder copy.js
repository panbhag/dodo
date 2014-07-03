var _ = require("underscore");
var mongoose = require('mongoose');
var asnync = require("async");
var Q = require("q");

function find(ObjectModel,objectParams,callback)
{

    var query ;
    var count;

    var mongoWhere =  whereBuilder(objectParams.where);
    console.log(mongoWhere);

    if(objectParams.count == 1)
    {
      query = ObjectModel.count(mongoWhere);
      count = true;
    }
    else
    {
      query = ObjectModel.find(mongoWhere);
    }  

    if(objectParams.order)
    {
        var sortParams = objectParams.order.split(",").join(" "); //mongoose accepts a space delimited order and parse give a comma seperated
        query.sort(sortParams);
    }

    if(objectParams.select)
    {
        var selectParams = objectParams.select.split(",").join(" "); //mongoose accepts a space delimited select and parse give a comma seperated
        query.select(selectParams);
    }

    query.limit(100);
    if(objectParams.limit)
    {
        query.limit(objectParams.limit)
    }

    if(objectParams.skip)
    {
        query.limit(objectParams.skip)
    }


    query.exec(function(err,o){
  if(err){console.log(err);self.res.send(500,err)}
   //delete o._id;
   //delete o.__v;
     var result;
     if(count)
     {
      result = {results:[],count:o};
     } 
     else
     {
        //console.log('pankaj',o);
        //o = o.toJSON() ;
        o = prepareResponse(o); //add objectId etc

        var result = {results:o};

     } 
      callback(null,result);
     
    });


}

function prepareResponse(response){
  var result = _.map(response,function(r){
      r.objectId = r._id;
      _.omit(r,"_id");
      return r;

  });

  return result;
}

//include=post
//include=post.author  -- multiple levels of inclusion
//include=comments,likes --mutiple inclusions
function includeChildren(include,result)
{
  //var includeKeys = include.split(",");


  if(result.length ==0){return result;}

  include = include.split(",");
  _.each(include,function(includeKeys){
      var includeKeyArray = includeKeys.split(".");
      var includeKey =  includeKeyArray.shift();

      var objectList = _.flatten(_.pluck(result,includeKey));
      if(objectList.length ==0){return result;} //there are no objects
      var objectIds = _.pluck(objectList,"objectId") ;
      var className = objectList[0].className;
      var ObjectModel = mongoose.model(className,ObjectSchema)  ;

      ObjectModel.where({'$in':objectIds}).exec(function(err,objects){

          //create a hash of objects with id as the key
          var objectHash = {};
          _.each(objects,function(o){objectHash[o._id] = o})

          // loop in the result and replace the objectPointer with the object
          var objectArray = [];  //acts as result for further include
          _.each(result,function(r){
                  var pointer = r[includeKey]
                  var object = objectHash[pointer.objectId];
                  pointer = _.extend(pointer,object);
                  objectArray.push(pointer);
          })

          if(includeKeyArray.length > 0)
          {

            includeChildren(includeKeyArray.join("."),objectArray)

          }

      });


  })





}



//where={"score":{"$in":[1,3,5,7,9]}}
//where={"post":{"__type":"Pointer","className":"Post","objectId":"8TOXdXf3tz"}}
//where={"post":{"$inQuery":{"where":{"image":{"$exists":true}},"className":"Post"}}}
//where={"post":{"$notInQuery":{"where":{"image":{"$exists":true}},"className":"Post"}}}
//where={"post":{"$notInQuery":{"where":{"image":{"$exists":true}},"className":"Post"}}}

//-----------------------------------------
//where={"$relatedTo":{"object":{"__type":"Pointer","className":"Post","objectId":"8TOXdXf3tz"},"key":"likes"}}
//where={"createdAt":{"$gte":{"__type":"Date","iso":"2011-08-21T18:02:52.249Z"}}}
function whereBuilder(parseWhere,callback)
{
    var mongoWhere = {};



    var result = Q();

    _.each(parseWhere, function(value,key,list){


      
        //key can be
            //fieldname
            //$OR
            //$relatedTo

        //value can be
            //value
            //object
                //keys can be
                //$selector
                //field name

      if(key[0] == "$")
      {
      if(key == "$or")
      {
      var multipleQ = []    
      _.each(value,function(q){
          multipleQ.push(whereBuilder(q));
       })
        mongoWhere({'$or':multipleQ});
      }

      else if(key = "$relatedTo")
      {


        /////

      }
      }
      else{ //key[0] is not $

       

      // {"name":{"fname":"a","lname":"b"}}
      if(_.isObject(value) && !value['__type']) // selector is applied
      {   

            mongoWhere[key] = {}
            _.each(_.keys(value),function(selector,callback)
            {
                var selectorValue = value[selector] ;
                var mongoSelector = selectorMapper(selector,selectorValue,function(){
                    _.extend(mongoWhere[key],mongoSelector);
                    callback();
                })//,function(mongoSelector){
            //          callback(); 

            //     });

            // },function(err){

            //     callback(null);
            // })

            })
        }    
        else if(_.isObject(value) && value['__type'])
        {
             mongoWhere[key + ".className"] = value.className;
             mongoWhere[key + ".objectId"] = value.objectId;
             //callback(null);

        }
        else   // simple equality test
        {
            
            if(key == "objectId")
            {
              value = mongoose.Types.ObjectId(value);
            }  
            mongoWhere[key] = value;
        }

      }


    })


        // selectorMapper(key,value,function(mapped){
        //     _.extend(mongoWhere,mapped);
        // });



    
    
    return mongoWhere;



}

//maps parse search key to mongo search keys
function selectorMapper(selector,value,callback)
{

    var mongoSelectors = ['$lt','$lte','$gt','$gte','$ne','$in','$nin','$exists','$all'];

    if(mongoSelectors.indexOf(selector) !== -1)
    {
         var filter = {};
         filter[selector] = value
         return filter;
    }

    //where={"hometown":{"$select":{"query":{"className":"Team","where":{"winPct":{"$gt":0.5}}},"key":"city"}}}
    //
    if(selector == "$select" || selector == "$dontSelect")
    {
           var className = value.query.className  ;
           var ObjectModel = mongoose.model(className,ObjectSchema)  ;
           var whereClause = value.query.where;
           var mongoWhere  = whereBuilder(whereClause);
           var selectKey = value.key;
           ObjectModel.find({}).where(mongoWhere).exec(function(err,collection){
               if(err){console.log(err);self.res.send(500,err)}
                var selectedValues = _.pluck(collection,key);
                var mongoSelector = selector == "$select"? "$in" : "$nin";
                return {mongoSelector:selectedValues};
           })
    }

    //where={"post":{"$inQuery":{"where":{"image":{"$exists":true}},"className":"Post"}}}
    //where={"post":{"$notInQuery":{"where":{"image":{"$exists":true}},"className":"Post"}}}
    if(selector=='$inQuery' || selector == "$notInQuery")
    {
        var className = value.className  ;
        var ObjectModel = mongoose.model(className,ObjectSchema)  ;
        var whereClause = value.where;
        ObjectModel.find({}).where(mongoWhere).exec(function(err,collection){
            var selectedIds = _.pluck(collection,"_id");
            var mongoSelector = selector == "$inQuery"? "$in" : "$nin";
            return {mongoSelector:selectedIds};
        })

    }

    //where={"$relatedTo":{"object":{"__type":"Pointer","className":"Post","objectId":"8TOXdXf3tz"},"key":"likes"}}
    if(selector == "$relatedTo")
    {
        var className = value.object.className  ;
        var ObjectModel = mongoose.model(className,ObjectSchema)  ;
        var objectId = value.object.objectId;
        var selectorKey = value.key;

        ObjectModel.findById(objectId).select(selectorKey).exec(function(err,o){
        if(err){console.log(err);self.res.send(500,err)}
               var selectorIds = _.pluck(o[selectorKey],"objectId");
               return {'$in':selectorIds};
        });
    }
}

module.exports = {find:find}

