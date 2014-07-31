var SharedListsModule = function () {
};

SharedListsModule.prototype.init = function(fw, onFinished) {
    this.fw = fw;
	onFinished.call(this);
}

SharedListsModule.prototype.onMessage = function (req, callback) {
	this.fw.modules["database"].run({table:"SharedLists", action: "custom", custom: req.body.message}, function(res){
		callback(res);
	});
};		
 
module.exports = SharedListsModule;