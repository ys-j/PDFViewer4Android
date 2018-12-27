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
(async function () {
	const searches = new URLSearchParams(location.search);
	const url = searches.get('file');

	const container = document.getElementById('container');
	
	class Renderer {
		constructor(url) {
			this.loaded = pdfjsLib.getDocument({
				url: url,
				cMapPacked: true,
				cMapUrl: 'cmaps/',
			});
			this.filename = pdfjsLib.getFilenameFromUrl(url);
			if (this.filename) {
				document.title = this.filename;
			}
		}
		async render(scale = 1) {
			const pdf = await this.loaded;
			const generator = async function* () {
				let i = 0;
				while (i < pdf.numPages) {
					yield pdf.getPage(++i);
				}
			};
			for await (let page of generator()) {
				const pageId = 'page' + page.pageNumber;
				const viewport = page.getViewport(scale);
				let wrapper = document.getElementById(pageId), canvas;
				if (wrapper) {
					canvas = wrapper.firstElementChild;
				} else {
					wrapper = document.createElement('div');
					wrapper.id = pageId;
					canvas = document.createElement('canvas');
					wrapper.insertAdjacentElement('beforeend', canvas);
					container.insertAdjacentElement('beforeend', wrapper);
				}
				wrapper.classList.add('loading');
				canvas.height = viewport.height;
				canvas.width = viewport.width;
				canvas.style = `height:${canvas.height / scale}px;width:${canvas.width / scale}px`;
				page.render({
					canvasContext: canvas.getContext('2d'),
					viewport: viewport,
				}).then(() => {
					wrapper.classList.remove('loading');
				});
			}
		}
	}

	// Header Elements
	const filename = document.getElementById('filename');
	const pageNumber = document.getElementById('pageNumber');
	const pageLength = document.getElementById('pageLength');

	try {
		if (!url) throw new Error('No URL.');

		const renderer = new Renderer(url);
		renderer.render(window.devicePixelRatio);
	
		const pdfDocument = await renderer.loaded;
		browser.runtime.sendMessage({
			data: await pdfDocument.getData(),
			filename: renderer.filename,
		});

		if (browser.tabs) {
			if ('onZoomChange' in browser.tabs) {
				const timeout = 200;
				let timeoutId;
				browser.tabs.onZoomChange.addListener(() => {
					clearTimeout(timeoutId);
					timeoutId = setTimeout(() => {
						renderer.render(window.devicePixelRatio);
					}, timeout);
				});
			}
		}

		// Header
		filename.textContent = renderer.filename;
		pageNumber.max = pdfDocument.numPages;
		pageLength.textContent = pdfDocument.numPages;
		pageNumber.onchange = e => {
			const page = document.getElementById('page' + e.target.value);
			page.scrollIntoView({ behavior: 'smooth' });
		};
		window.onscroll = e => {
			const currentPageNumber = pageNumber.value | 0;
			const page = document.getElementById('page' + currentPageNumber);
			const { bottom, top, height } = page.getBoundingClientRect();
			const viewportHeight = document.documentElement.getBoundingClientRect().height;
			if (bottom < viewportHeight * .5 && bottom < height) {
				pageNumber.value = currentPageNumber + 1;
			} else if (top > viewportHeight * .5 || top > height) {
				pageNumber.value = currentPageNumber - 1;
			}
		};
	} catch (e) {
		// Header
		pageNumber.max = pageNumber.min = pageNumber.value = 0;
		pageLength.textContent = 0;
		// Main
		container.insertAdjacentHTML('beforeend', `<p class=error>Failed to load PDF file: ${e.message}</p>`)
	}
})();