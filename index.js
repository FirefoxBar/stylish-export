var dbFileElm = document.getElementById('dbfile');

// Start the worker in which sql.js will run
var worker = new Worker("sql.js/worker.sql.js");
worker.onerror = error;

// Open a database
worker.postMessage({action:'open'});

function error(e) {
	console.log(e);
}

// Run a command in the database
function execute(commands, callback) {
	if (commands.substr(-1) !== ';') {
		commands += ';';
	}
	tic();
	worker.onmessage = function(event) {
		var results = event.data.results;
		toc("Executing SQL");
		tic();
		if (callback) {
			callback(results);
		}
		toc("Displaying results");
	}
	worker.postMessage({action:'exec', sql:commands});
}

// Performance measurement functions
var tictime;
if (!window.performance || !performance.now) {window.performance = {now:Date.now}}
function tic () {
	tictime = performance.now()
}
function toc(msg) {
	var dt = performance.now()-tictime;
	console.log((msg||'toc') + ": " + dt + "ms");
}

// Load a db from a file
dbFileElm.onchange = function() {
	var f = dbFileElm.files[0];
	var r = new FileReader();
	r.onload = function() {
		worker.onmessage = function () {
			toc("Loading database from file");
			// run convert
			convert();
		};
		tic();
		try {
			worker.postMessage({action:'open',buffer:r.result}, [r.result]);
		}
		catch(exception) {
			worker.postMessage({action:'open',buffer:r.result});
		}
	}
	r.readAsArrayBuffer(f);
}

var convert = function() {
	var rs = [];
	var CssToProperty = {"url": "urls", "url-prefix": "urlPrefixes", "domain": "domains", "regexp": "regexps"};
	execute('SELECT * FROM styles', function(result) {
		// get columns
		for (var k in result[0].columns) {
			switch (result[0].columns[k]) {
				case 'id':
					var id = k;
					break;
				case 'url':
					var url = k;
					break;
				case 'updateUrl':
					var updateUrl = k;
					break;
				case 'md5Url':
					var md5Url = k;
					break;
				case 'originalMd5':
					var originalMd5 = k;
					break;
				case 'name':
					var name = k;
					break;
				case 'enabled':
					var enabled = k;
					break;
				case 'id':
					var id = k;
					break;
				case 'code':
					var code = k;
					break;
			}
		}
		for (var i = 0; i < result[0].values.length; i++) {
			// style basic info
			var style = {
				"sections": [],
				"url": result[0].values[i][url],
				"updateUrl": result[0].values[i][updateUrl],
				"md5Url": result[0].values[i][md5Url],
				"originalMd5": result[0].values[i][originalMd5],
				"name": result[0].values[i][name],
				"enabled": result[0].values[i][enabled],
				"id": result[0].values[i][id]
			};
			// updateUrl
			if (style.updateUrl.indexOf('userstyles.org') > 0) {
				try {
					var style_id = result[0].values[i][updateUrl].match(/styles\/(\d+)\//)[1];
				} catch (e) {
					var style_id = result[0].values[i][updateUrl].match(/styles\/(\d+)\.css/)[1];
				}
				style.updateUrl = 'https://userstyles.org/styles/chrome/' + style_id + '.json';
			}
			// code
			var codeContent = result[0].values[i][code].replace(/@namespace url\((.*?)\);/g, "");
			// split by @-moz-document
			var sections = codeContent.trim().split('@-moz-document ');
			for (let f of sections) {
				var section = {
					"urls": [],
					"urlPrefixes": [],
					"domains": [],
					"regexps": [],
					"code": ""
				};
				while (true) {
					f = trimNewLines(trimNewLines(f).replace(/^,/, ''));
					var m = f.match(/^(url|url-prefix|domain|regexp)\((['"]?)(.+?)\2\)/);
					if (!m) {
						break;
					}
					f = f.replace(m[0], '');
					var aType = CssToProperty[m[1]];
					var aValue = aType != "regexps" ? m[3] : m[3].replace(/\\\\/g, "\\");
					if (section[aType].indexOf(aValue) < 0) {
						section[aType].push(aValue);
					}
				}
				// split this section
				var index = 0;
				var leftCount = 0;
				while (index < f.length) {
					// ignore comments
					if (f[index] === '/' && f[index + 1] === '*') {
						index += 2;
						while (f[index] !== '*' || f[index + 1] !== '/') {
							index++;
						}
						index += 2;
					}
					if (f[index] === '{') {
						leftCount++;
					}
					if (f[index] === '}') {
						leftCount--;
					}
					index++;
					if (leftCount <= 0) {
						break;
					}
				}
				if (f[0] === '{') {
					section.code = trimNewLines(f.substr(1, index - 2));
					if (index < f.length) {
						addSection(style, {
							"urls": [],
							"urlPrefixes": [],
							"domains": [],
							"regexps": [],
							"code": trimNewLines(f.substr(index))
						});
					}
				} else {
					section.code = trimNewLines(f);
				}
				addSection(style, section);
			}
			rs.push(style);
		}
		download('xtyle.json', JSON.stringify(rs));
	});
};

function addSection(style, section) {
	// don't add empty sections
	if (!(section.code || section.urls || section.urlPrefixes || section.domains || section.regexps)) {
		return;
	}
	style.sections.push(section);
}

function trimNewLines(s) {
	return s.replace(/^[\s\n]+/, "").replace(/[\s\n]+$/, "");
}

var download = function(name, content) {
	var a = document.getElementById('download');
	var blob = new Blob([content]);
	var evt = document.createEvent("MouseEvents");
	evt.initMouseEvent("click", true, false, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
	evt.initEvent("click", false, false);
	a.download = name;
	a.href = URL.createObjectURL(blob);
	document.getElementById('download-label').style.display = "block";
	a.dispatchEvent(evt);
};