function SharedLists(){
}

SharedLists.prototype.handleQuery = function(db, query, callback){
	
}

SharedLists.prototype.handleCustom = function(db, custom, callback){
	var t = this;
	switch(custom.action){
		case "GetBucket" :
			if(custom.bucketId != undefined && custom.bucketId != ""){
				this.getBucket(db, custom.bucketId, function(bucket){
					callback(bucket);
				});
			}
			break;
		case "GetList" :
			if(custom.listId != undefined && custom.listId != ""){
				this.getList(db, custom.listId, function(list){
					t.addListToBucketIfRelevant(db, custom.bucketId, custom.listId, function(){
						callback(list);
					});
				});
			}
			break;
		case "RemoveListFromBucket" :
			if(custom.listId != undefined && custom.bucketId != undefined)
				db.query("DELETE FROM SL_BucketLists WHERE bucketid = (SELECT id FROM SL_Buckets WHERE SL_Buckets.ClientId = ?) AND listid = (SELECT id FROM SL_Lists WHERE SL_Lists.ClientId = ?)", [custom.bucketId, custom.listId], function(err){
					sl.getBucket(db, custom.bucketId, function(bucket){
						callback({success: true, bucket: bucket});
					});
				});
			else
				callback({error:"Invalid request: No list or bucket id"});
			break;
		case "AddListItem" :
			if(custom.listId !== undefined && custom.Title !== undefined)
				db.query("INSERT INTO SL_ListItems(listid, Title, finished) VALUES((SELECT id FROM SL_Lists WHERE SL_Lists.ClientId = ?), ?, 0)", [custom.listId, custom.Title], function(err){
					t.getList(db, custom.listId, function(list){
						callback({success: true, list: list});
					});
				});
			else
				callback({error:"Invalid request: No list id or name"});
			break;
		case "ToggleListItem" :
			if(custom.listId !== undefined && custom.itemId !== undefined)
				this.getList(db, custom.listId, function(list){
					db.query("UPDATE SL_ListItems SET finished = COALESCE(CASE WHEN finished = 0 THEN 1 ELSE 0 END, 0) WHERE id = ? AND EXISTS (SELECT ClientId FROM SL_Lists WHERE SL_Lists.id = SL_ListItems.listid AND SL_Lists.ClientId = ?)", [custom.itemId, custom.listId], function(err){
						//t.getList(db, custom.listId, function(list){
							callback({success: true/*, list: list*/});
						//});
					});
				});
			else
				callback({error:"Invalid request: No list id or item id"});
			break;
		case "ClearCompleted" :
			if(custom.listId !== undefined)
				db.query("DELETE FROM SL_ListItems WHERE listid = (SELECT id FROM SL_Lists WHERE ClientId = ?) AND finished = 1", [custom.listId], function(err){
					t.getList(db, custom.listId, function(list){
						callback({success: true, list: list});
					});
				});
			else
				callback({error:"Invalid request: No list id"});
			break;
		case "ChangeListName" :
			if(custom.listId && custom.Title){
				db.query("UPDATE SL_Lists SET Title = ? WHERE ClientId = ?", [custom.Title, custom.listId], function(err){
					t.getBucket(db, custom.bucketId, function(bucket){
						t.getList(db, custom.listId, function(list){
							callback({success: true, list: list, bucket: bucket});
						});
					});
				});
			}
			break;
		case "ChangeBucketName" :
			if(custom.bucketId && custom.Title){
				db.query("UPDATE SL_Buckets SET Title = ? WHERE ClientId = ?", [custom.Title, custom.bucketId], function(err){
					t.getBucket(db, custom.bucketId, function(bucket){
						callback({success: true, bucket: bucket});
					});
				});
			}
			break;
		case "RenameListItem" :
			if(custom.listId !== undefined && custom.itemId !== undefined)
				this.getList(db, custom.listId, function(list){
					db.query("UPDATE SL_ListItems SET Title = ? WHERE id = ? AND EXISTS (SELECT ClientId FROM SL_Lists WHERE SL_Lists.id = SL_ListItems.listid AND SL_Lists.ClientId = ?)", [custom.Title, custom.itemId, custom.listId], function(err){
						//t.getList(db, custom.listId, function(list){
							callback({success: true/*, list: list*/});
						//});
					});
				});
			else
				callback({error:"Invalid request: No list id or item id"});
			break;
	}
}

SharedLists.prototype.addListToBucketIfRelevant = function(db, bucketClientId, listClientId, callback){
	if(bucketClientId && listClientId){
		db.query("EXEC SL_addListToBucketIfRelevant @bucketClientId = ?, @listClientId = ?", [bucketClientId, listClientId], function(err){
			callback();
		});
	} else {
		callback()
	}
	/*
	if(bucketClientId && listClientId){
		db.query("INSERT OR IGNORE INTO SL_BucketLists(bucketid, listid) VALUES((SELECT id FROM SL_Buckets WHERE SL_Buckets.ClientId = $bucketid), (SELECT id FROM SL_Lists WHERE SL_Lists.ClientId = $listid))", {$bucketid: bucketClientId, $listid: listClientId}, function(err){
			callback();
		});
	} else {
		callback()
	}
	*/
}

SharedLists.prototype.getBucket = function(db, clientId, callback){
	db.query("EXEC SL_getBucket ?", [clientId], function(res){
		var bucket = {Title: res[0].Title, bucketId: res[0].ClientId, lists: []};

		db.query("EXEC SL_getBucketLists ?", [clientId], function(res){
			for(i in res)
				bucket.lists.push({id: res[i].ClientId, Title: res[i].Title});

			callback(bucket);
		});

	})
	/*
	db.query("INSERT OR IGNORE INTO SL_Buckets(ClientId, Title) VALUES($ClientId, '')", {$ClientId: clientId}, function(err){
		var bucket = {Title: "", lists: []};
		var sql = "SELECT SL_Lists.ClientId AS id, SL_Lists.Title FROM SL_Buckets INNER JOIN SL_BucketLists on SL_Buckets.id = SL_BucketLists.bucketid INNER JOIN SL_Lists ON SL_BucketLists.listid = SL_Lists.id WHERE SL_Buckets.ClientId = $id";
		db.query(sql, {$id: clientId}, function(res){
			for(i in res)
				bucket.lists[bucket.lists.length] = {id: res[i].id, Title: res[i].Title};
				
			db.query("SELECT ClientId, Title FROM SL_Buckets WHERE SL_Buckets.ClientId = $id", {$id: clientId}, function(b){
				if(b[0] != undefined){
					bucket.Title = b[0].Title;
					bucket.bucketId = b[0].ClientId;
				}
				callback(bucket);
			});
		});
	});
	*/
}

SharedLists.prototype.getList = function(db, clientId, callback){

	db.query("EXEC SL_getList ?", [clientId], function(res){
		var list = {Title: res[0].Title, listId: res[0].ClientId, items: []};

		db.query("EXEC SL_getListItems ?", [clientId], function(res){
			for(i in res)
				list.items.push({id: res[i].Id, Title: res[i].Title, finished: res[i].Finished == 1 ? true : false});

			callback(list);
		});

	})

	/*
	db.query("INSERT OR IGNORE INTO SL_Lists(ClientId, Title) VALUES($ClientId, 'New List')", {$ClientId: clientId}, function(err){
		var list = {Title: "", items: []};
		var sql = "SELECT SL_ListItems.id as id, SL_ListItems.Title, finished FROM SL_Lists INNER JOIN SL_ListItems on SL_Lists.id = SL_ListItems.listid WHERE SL_Lists.ClientId = $id";
		db.query(sql, {$id: clientId}, function(res){
			for(i in res)
				list.items[list.items.length] = {id: res[i].id, Title: res[i].Title, finished: res[i].Finished == 1 ? true : false};
				
			db.query("SELECT ClientId, Title FROM SL_Lists WHERE SL_Lists.ClientId = $id", {$id: clientId}, function(l){
				if(l[0] !== undefined){
					list.Title = l[0].Title;
					list.listId = l[0].ClientId;
				}
				callback(list);
			});
		});
	});
	*/
}

SharedLists.prototype.init = function(db){
	sl = this;
	var query = "";
	
	if(db.driver.indexOf('mssql') >= 0){
		/*
		query += "CREATE TABLE SL_Buckets(Id INTEGER PRIMARY KEY IDENTITY(1, 1), ClientId nvarchar(50), Title nvarchar(100));";
		query += "CREATE UNIQUE INDEX IX_SL_Buckets_ClientId ON SL_Buckets (ClientId);";

		query += "CREATE TABLE SL_Lists(Id INTEGER PRIMARY KEY IDENTITY(1, 1), ClientId nvarchar(50), Title nvarchar(100));";
		query += "CREATE UNIQUE INDEX IX_SL_Lists_ClientId ON SL_Lists (ClientId);";

		query += "CREATE TABLE SL_BucketLists(BucketId int, ListId int, PRIMARY KEY (BucketId, ListId), FOREIGN KEY(BucketId) REFERENCES SL_Buckets(Id), FOREIGN KEY(ListId) REFERENCES SL_Lists(id));";
		
		query += "CREATE TABLE SL_ListItems(Id INTEGER PRIMARY KEY IDENTITY(1, 1), ListId int, Title nvarchar(200), Finished int, FOREIGN KEY(ListId) REFERENCES SL_Lists(Id));";
		*/
	}
	else {
		query += "CREATE TABLE IF NOT EXISTS SL_Buckets(Id INTEGER PRIMARY KEY AUTOINCREMENT, ClientId nvarchar(50), Title nvarchar(100));";
		query += "CREATE UNIQUE INDEX IF NOT EXISTS IX_SL_Buckets_ClientId ON SL_Buckets (ClientId);";

		query += "CREATE TABLE IF NOT EXISTS SL_Lists(Id INTEGER PRIMARY KEY AUTOINCREMENT, ClientId nvarchar(50), Title nvarchar(100));";
		query += "CREATE UNIQUE INDEX IF NOT EXISTS IX_SL_Lists_ClientId ON SL_Lists (ClientId);";

		query += "CREATE TABLE IF NOT EXISTS SL_BucketLists(BucketId int, ListId int, PRIMARY KEY (BucketId, ListId), FOREIGN KEY(BucketId) REFERENCES SL_Buckets(Id), FOREIGN KEY(ListId) REFERENCES SL_Lists(id));";
		
		query += "CREATE TABLE IF NOT EXISTS SL_ListItems(Id INTEGER PRIMARY KEY AUTOINCREMENT, ListId int, Title nvarchar(200), Finished int, FOREIGN KEY(ListId) REFERENCES SL_Lists(Id));";
	}

	db.exec(query);
}
		
exports = module.exports = SharedLists;