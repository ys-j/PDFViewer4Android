/*
Copyright 2018 _y_s

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

	http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
const encoder = new TextEncoder();
const mime = {
	html: 'text/html',
	pdf: 'application/pdf',
};
const replacement = encoder.encode(`<!DOCTYPE html><meta charset=utf-8><title>PDF Viewer</title>\
<meta name=viewport content="width=device-width">\
<base href="${browser.runtime.getURL('/')}" target=_blank>\
<link rel=stylesheet href=viewer.css>\
<header><h1 id=filename></h1><div id=status role=button></div><div><input id=pageNumber type=number min=1 value=1> / <span id=pageLength>1</span></div><progress id=progress></progress></header>\
<main id=container></main>
<footer><span>PDF Viewer for Android</span><small>This add-on includes <a href=https://mozilla.github.io/pdf.js/>PDF.js</a> licensed under the <a href=http://www.apache.org/licenses/LICENSE-2.0>Apache License, Version 2.0</a>.</small></footer>`);

let blobUrl;

browser.webRequest.onHeadersReceived.addListener(details => {
	const headers = new Map(details.responseHeaders.map(header => [ header.name.toLowerCase(), header.value.toLowerCase() ]));
	if (headers.get('content-type') === mime.pdf) {
		const filter = browser.webRequest.filterResponseData(details.requestId);
		filter.onstart = () => {
			URL.revokeObjectURL(blobUrl);
			filter.write(replacement);
			filter.close();
		};
		const oncompleted = async (id, info) => {
			if (info.status === 'complete' && id === details.tabId) {
				browser.tabs.onUpdated.removeListener(oncompleted);
				browser.tabs.executeScript(id, { code: 'var tabId=' + id });
				await browser.tabs.executeScript(id, { file: 'pdf.js' });
				await browser.tabs.executeScript(id, { file: 'viewer.js' });
			}
		};
		browser.tabs.onUpdated.addListener(oncompleted);
		return { responseHeaders: [ { name: 'content-type', value: mime.html } ] };
	} else {
		browser.pageAction.hide(details.tabId);
		return;
	}
}, { urls: ['<all_urls>'], types: ['main_frame'] }, ['blocking', 'responseHeaders']);

let creatingDownloadParams = new Promise(() => {});
browser.runtime.onMessage.addListener((message, sender) => {
	URL.revokeObjectURL(blobUrl);
	const blob = new Blob([message.data], { type: mime.pdf });
	blobUrl = URL.createObjectURL(blob);
	creatingDownloadParams = Promise.resolve({
		url: blobUrl,
		filename: message.filename,
	});
	browser.pageAction.show(sender.tab.id);
});

browser.pageAction.onClicked.addListener(async () => {
	browser.downloads.download(await creatingDownloadParams);
});