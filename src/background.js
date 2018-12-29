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
const mimePdf = 'application/pdf';
const gettingPlatformInfo = browser.runtime.getPlatformInfo();

browser.webRequest.onHeadersReceived.addListener(details => {
	const headers = new Map(details.responseHeaders.map(header => [ header.name.toLowerCase(), header.value ]));
	if (headers.get('content-type') == mimePdf) {
		return { redirectUrl: browser.runtime.getURL('index.html') + '?file=' + details.url };
	} else {
		browser.pageAction.hide(details.tabId);
		return;
	}
}, { urls: ['*://*/*'], types: ['main_frame'] }, ['blocking', 'responseHeaders']);

let creatingDownloadParams = new Promise(() => {});
browser.runtime.onMessage.addListener((message, sender) => {
	const blob = new Blob([message.data], { type: mimePdf });
	creatingDownloadParams = Promise.resolve({
		url: URL.createObjectURL(blob),
		filename: message.filename,
	});
	browser.pageAction.show(sender.tab.id);
});

browser.pageAction.onClicked.addListener(async () => {
	browser.downloads.download(await creatingDownloadParams);
});