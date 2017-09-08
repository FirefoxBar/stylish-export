//languages
var languages = {'zh-CN': 'index.html', 'zh-TW': 'index_zh_tw.html', 'en': 'index_en.html'};
if (!window.location.search.includes('force-language')) {
	var language = navigator.language;
	if (typeof(languages[language]) === 'undefined') {
		language = 'en';
	}
	if (current_language !== language) {
		window.location.href = languages[language];
	}
}

document.addEventListener("DOMContentLoaded", function() {
	// stat
	if (navigator.doNotTrack != 1) {
		var hm = document.createElement("script");
		hm.src = "https://hm.baidu.com/hm.js?eddab75c23e1853a476011bb95a585c9";
		document.head.appendChild(hm);
	}

	var dbFileElm = document.getElementById('dbfile');
	var CssToProperty = {"url": "urls", "url-prefix": "urlPrefixes", "domain": "domains", "regexp": "regexps"};

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

	function trimNewLines(s) {
		return s.replace(/^[\s\n]+/, "").replace(/[\s\n]+$/, "");
	}

	function parseMozillaFormat(css) {
		const docParams = ['@-moz-document ', "@-moz-document\n", "@-moz-document\r\n"];
		let allSection = [{
			"urls": [],
			"urlPrefixes": [],
			"domains": [],
			"regexps": [],
			"code": ""
		}];
		let mozStyle = trimNewLines(css.replace(/@namespace url\((.*?)\);/g, ""));
		let currentIndex = findMozDocument(mozStyle, 0);
		let lastIndex = currentIndex;
		if (currentIndex !== 0) {
			if (currentIndex > 0) {
				allSection[0].code += "\n" + trimNewLines(mozStyle.substr(0, currentIndex - 1));
			} else {
				allSection[0].code += trimNewLines(mozStyle);
			}
		}
		// split by @-moz-document
		while (findMozDocument(mozStyle, currentIndex) >= 0) {
			currentIndex++;
			// Jump to next
			let nextMoz = findMozDocument(mozStyle, currentIndex)
			let nextComment = mozStyle.indexOf('/*', currentIndex);
			if (nextComment === -1){
				nextComment = nextMoz;
			}
			let nextQuote = mozStyle.indexOf('"', currentIndex);
			if (nextQuote === -1){
				nextQuote = nextMoz;
			}
			currentIndex = Math.min(nextMoz, nextComment, nextQuote);
			if (currentIndex < 0) {
				parseOneSection(mozStyle.substr(lastIndex));
				break;
			}
			currentIndex = ignoreSomeCodes(mozStyle, currentIndex);
			if (findMozDocument(mozStyle, currentIndex) === currentIndex) {
				parseOneSection(mozStyle.substr(lastIndex, currentIndex - lastIndex));
				lastIndex = currentIndex;
			}
		}
		// remove global section if it is empty
		allSection[0].code = trimNewLines(allSection[0].code);
		if (allSection[0].code === '') {
			allSection.splice(0, 1);
		}
		return allSection;
		// find @-moz-document(space) or @-moz-document(\n)
		function findMozDocument(str, index) {
			let min = -1;
			for (let i = 0; i < docParams.length; i++) {
				let t = str.indexOf(docParams[i], index || 0);
				if (t >= 0 && (min === -1 || min > t)) {
					min = t;
				}
			}
			return min;
		}
		function ignoreSomeCodes(f, index) {
			// ignore quotation marks
			if (f[index] === '"') {
				index++;
				do {
					index = f.indexOf('"', index);
					index++;
				} while (f[index - 2] === '\\');
			}
			if (f[index] === "'") {
				index++;
				do {
					index = f.indexOf("'", index);
					index++;
				} while (f[index - 2] === '\\');
			}
			// ignore comments
			if (f[index] === '/' && f[index + 1] === '*') {
				index += 2;
				index = f.indexOf('*/', index);
				index ++;
			}
			return index;
		}
		function parseOneSection(f) {
			f = f.replace('@-moz-document', '');
			if (f === '') {
				return;
			}
			let section = {
				"urls": [],
				"urlPrefixes": [],
				"domains": [],
				"regexps": [],
				"code": ""
			};
			while (true) {
				let i = 0;
				do {
					f = trimNewLines(f).replace(/^,/, '').replace(/^\/\*(.*?)\*\//, '');
					if (i++ > 30) {
						console.error(f.substr(0, 20));
						throw new Error("Timeout. May be is not a legitimate CSS");
					}
				} while (!/^(url|url-prefix|domain|regexp)\((['"]?)(.+?)\2\)/.test(f) && f[0] !== '{');
				let m = f.match(/^(url|url-prefix|domain|regexp)\((['"]?)(.+?)\2\)/);
				if (!m) {
					break;
				}
				f = f.replace(m[0], '');
				let aType = CssToProperty[m[1]];
				let aValue = aType != "regexps" ? m[3] : m[3].replace(/\\\\/g, "\\");
				if (section[aType].indexOf(aValue) < 0) {
					section[aType].push(aValue);
				}
			}
			// split this section
			let index = 0;
			let leftCount = 0;
			while (index < f.length - 1) {
				index = ignoreSomeCodes(f, index);
				if (f[index] === '{') {
					leftCount++;
				} else if (f[index] === '}') {
					leftCount--;
				}
				index++;
				if (leftCount <= 0) {
					break;
				}
			}
			if (f[0] === '{') {
				section.code = trimNewLines(f.substr(1, index - 2));
				if (index < f.length - 1) {
					allSection[0].code += "\n" + trimNewLines(f.substr(index));
				}
			} else {
				section.code = trimNewLines(f);
			}
			addSection(section);
		}
		function addSection(section) {
			// don't add empty sections
			if (!section.code) {
				return;
			}
			if (!section.urls.length && !section.urlPrefixes.length && !section.domains.length && !section.regexps.length) {
				allSection[0].code += "\n" + section.code;
			} else {
				allSection.push(section);
			}
		}
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
					"url": result[0].values[i][url],
					"updateUrl": result[0].values[i][updateUrl],
					"md5Url": result[0].values[i][md5Url],
					"originalMd5": result[0].values[i][originalMd5],
					"name": result[0].values[i][name],
					"enabled": result[0].values[i][enabled],
					"advanced": {"item": {}, "saved": {}, "css": []},
					"id": result[0].values[i][id],
					"sections": parseMozillaFormat(result[0].values[i][code])
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
				rs.push(style);
			}
			download('xtyle.json', JSON.stringify(rs));
		});
	};

	function download(name, content) {
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
});