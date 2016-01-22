var fs = require("fs");
var dbFile = "";
var sqlite = require("sqlite3").verbose();
var db = null;

var SharedListsModule = function () {
};

SharedListsModule.prototype.init = function(fw, onFinished) {
  this.fw = fw;
  dbFile = fw.config.data + "/sharedlists.db";

  console.log("Shared lists: Trying to open database file: " + dbFile)

  db = new sqlite.Database(dbFile);

  db.serialize(function() {
    if(!fs.existsSync(dbFile)) {
      console.log("Shared lists: Creating tables in database...");
      db.run("CREATE TABLE IF NOT EXISTS Buckets(Id INTEGER PRIMARY KEY AUTOINCREMENT, ClientId nvarchar(50), Title nvarchar(100));");
  		db.run("CREATE UNIQUE INDEX IF NOT EXISTS IX_Buckets_ClientId ON Buckets (ClientId);");
  		db.run("CREATE TABLE IF NOT EXISTS Lists(Id INTEGER PRIMARY KEY AUTOINCREMENT, ClientId nvarchar(50), Title nvarchar(100));");
  		db.run("CREATE UNIQUE INDEX IF NOT EXISTS IX_Lists_ClientId ON Lists (ClientId);");
  		db.run("CREATE TABLE IF NOT EXISTS BucketLists(BucketId int, ListId int, PRIMARY KEY (BucketId, ListId), FOREIGN KEY(BucketId) REFERENCES Buckets(Id), FOREIGN KEY(ListId) REFERENCES Lists(id));");
  		db.run("CREATE TABLE IF NOT EXISTS ListItems(Id INTEGER PRIMARY KEY AUTOINCREMENT, ListId int, Title nvarchar(200), Finished int, FOREIGN KEY(ListId) REFERENCES Lists(Id));");
    }
  });

	onFinished.call(this);
}

SharedListsModule.prototype.onMessage = function (req, callback) {
  /*
	this.fw.modules["database"].run({table:"SharedLists", action: "custom", custom: req.body.message}, function(res){
		callback(res);
	});
  */
  this.handleCallback(req.body.message, function(res){
    callback(res);
  })
};

SharedListsModule.prototype.handleCallback = function(custom, callback){
	var t = this;

	switch(custom.action){
		case "GetBucket" :
			if(custom.bucketId != undefined && custom.bucketId != ""){
				this.getBucket(custom.bucketId, function(bucket){
					callback(bucket);
				});
			}
			break;
		case "GetList" :
			if(custom.listId != undefined && custom.listId != ""){
				this.getList(custom.listId, function(list){
					t.addListToBucketIfRelevant(custom.bucketId, custom.listId, function(){
						callback(list);
					});
				});
			}
			break;
		case "RemoveListFromBucket" :
			if(custom.listId != undefined && custom.bucketId != undefined)
				db.run("DELETE FROM BucketLists WHERE bucketid = (SELECT id FROM Buckets WHERE Buckets.ClientId = ?) AND listid = (SELECT id FROM Lists WHERE Lists.ClientId = ?)", [custom.bucketId, custom.listId], function(err){
					sl.getBucket(custom.bucketId, function(bucket){
						callback({success: true, bucket: bucket});
					});
				});
			else
				callback({error:"Invalid request: No list or bucket id"});
			break;
		case "AddListItem" :
			if(custom.listId !== undefined && custom.Title !== undefined)
				db.run("INSERT INTO ListItems(listid, Title, finished) VALUES((SELECT id FROM Lists WHERE Lists.ClientId = ?), ?, 0)", [custom.listId, custom.Title], function(err){
					t.getList(custom.listId, function(list){
						callback({success: true, list: list});
					});
				});
			else
				callback({error:"Invalid request: No list id or name"});
			break;
		case "ToggleListItem" :
			if(custom.listId !== undefined && custom.itemId !== undefined)
				this.getList(custom.listId, function(list){
					db.run("UPDATE ListItems SET finished = COALESCE(CASE WHEN finished = 0 THEN 1 ELSE 0 END, 0) WHERE id = ? AND EXISTS (SELECT ClientId FROM Lists WHERE Lists.id = ListItems.listid AND Lists.ClientId = ?)", [custom.itemId, custom.listId], function(err){
						//t.getList(custom.listId, function(list){
							callback({success: true/*, list: list*/});
						//});
					});
				});
			else
				callback({error:"Invalid request: No list id or item id"});
			break;
		case "ClearCompleted" :
			if(custom.listId !== undefined)
				db.run("DELETE FROM ListItems WHERE listid = (SELECT id FROM Lists WHERE ClientId = ?) AND finished = 1", [custom.listId], function(err){
					t.getList(custom.listId, function(list){
						callback({success: true, list: list});
					});
				});
			else
				callback({error:"Invalid request: No list id"});
			break;
		case "ChangeListName" :
			if(custom.listId && custom.Title){
				db.run("UPDATE Lists SET Title = ? WHERE ClientId = ?", [custom.Title, custom.listId], function(err){
					t.getBucket(custom.bucketId, function(bucket){
						t.getList(custom.listId, function(list){
							callback({success: true, list: list, bucket: bucket});
						});
					});
				});
			}
			break;
		case "ChangeBucketName" :
			if(custom.bucketId && custom.Title){
				db.run("UPDATE Buckets SET Title = ? WHERE ClientId = ?", [custom.Title, custom.bucketId], function(err){
					t.getBucket(custom.bucketId, function(bucket){
						callback({success: true, bucket: bucket});
					});
				});
			}
			break;
		case "RenameListItem" :
			if(custom.listId !== undefined && custom.itemId !== undefined)
				this.getList(custom.listId, function(list){
					db.run("UPDATE ListItems SET Title = ? WHERE id = ? AND EXISTS (SELECT ClientId FROM Lists WHERE Lists.id = ListItems.listid AND Lists.ClientId = ?)", [custom.Title, custom.itemId, custom.listId], function(err){
						//t.getList(custom.listId, function(list){
							callback({success: true/*, list: list*/});
						//});
					});
				});
			else
				callback({error:"Invalid request: No list id or item id"});
			break;
	}
}

SharedListsModule.prototype.addListToBucketIfRelevant = function(bucketClientId, listClientId, callback){
	if(bucketClientId && listClientId){
		db.run("INSERT OR IGNORE INTO BucketLists(bucketid, listid) VALUES((SELECT id FROM Buckets WHERE Buckets.ClientId = $bucketid), (SELECT id FROM Lists WHERE Lists.ClientId = $listid))", {$bucketid: bucketClientId, $listid: listClientId}, function(err){
			callback();
		});
	} else {
		callback()
	}
}

SharedListsModule.prototype.getBucket = function(clientId, callback){

	db.run("INSERT OR IGNORE INTO Buckets(ClientId, Title) VALUES($ClientId, '')", clientId, function(err){
		var bucket = {Title: "", lists: []};
		var sql = "SELECT Lists.ClientId AS id, Lists.Title FROM Buckets INNER JOIN BucketLists on Buckets.id = BucketLists.bucketid INNER JOIN Lists ON BucketLists.listid = Lists.id WHERE Buckets.ClientId = ?";
		db.all(sql, clientId, function(err, res){

			for(i in res)
				bucket.lists.push({id: res[i].id, Title: res[i].Title});

			db.get("SELECT ClientId, Title FROM Buckets WHERE Buckets.ClientId = ?", clientId, function(err, b){
        if(err) console.log("Error: " + err)

				if(b){
					bucket.Title = b.Title;
					bucket.bucketId = b.ClientId;
				}
				callback(bucket);
			});
		});
	});
}

SharedListsModule.prototype.getList = function(clientId, callback){

	db.run("INSERT OR IGNORE INTO Lists(ClientId, Title) VALUES(?, 'New List')", clientId, function(err){
		var list = {Title: "", items: []};
		var sql = "SELECT ListItems.id as id, ListItems.Title, finished FROM Lists INNER JOIN ListItems on Lists.id = ListItems.listid WHERE Lists.ClientId = ?";
		db.all(sql, clientId, function(err, res){
			for(i in res)
				list.items.push({id: res[i].id, Title: res[i].Title, finished: res[i].Finished == 1 ? true : false});

			db.get("SELECT ClientId, Title FROM Lists WHERE Lists.ClientId = ?", clientId, function(err, l){
				if(l){
					list.Title = l.Title;
					list.listId = l.ClientId;
				}
				callback(list);
			});
		});
	});
}

module.exports = SharedListsModule;
