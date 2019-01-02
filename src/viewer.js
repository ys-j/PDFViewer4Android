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
pdfjsLib.GlobalWorkerOptions.workerSrc = browser.runtime.getURL('pdf.worker.js');

(async function (url, container) {
	// Page Action
	window.addEventListener('unload', () => browser.pageAction.hide(tabId), { passive: true });
	window.addEventListener('pageshow', () => browser.pageAction.show(tabId), { passive: true });

	// Header Elements
	const filename = document.getElementById('filename');
	const status = document.getElementById('status');
	const pageNumber = document.getElementById('pageNumber');
	const pageLength = document.getElementById('pageLength');
	const progress = document.getElementById('progress');
	
	async function* pageGenerator(renderer) {
		let i = progress.value = 0;
		const pdf = await renderer.loaded;
		progress.max = pdf.numPages;
		while (i < pdf.numPages) {
			await promisePause;
			yield pdf.getPage(++i);
			pageNumber.max = pageLength.textContent = progress.value = i;
		}
	};

	let promisePause = Promise.resolve();

	class Renderer {
		constructor(url) {
			this.loaded = pdfjsLib.getDocument({
				url: url,
				cMapPacked: true,
				cMapUrl: browser.runtime.getURL('cmaps/'),
				withCredentials: true,
			});
			this.filename = pdfjsLib.getFilenameFromUrl(url);
		}
		async render(scale = 1) {
			for await (const page of pageGenerator(this)) {
				const pageId = 'page' + page.pageNumber;
				const viewport = page.getViewport(scale * 96 / 72);
				const paper = detectPaparSize(viewport, scale);
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
				canvas.className = `paper-${paper.size}-${paper.orientation}`;
				canvas.height = viewport.height;
				canvas.width = viewport.width;
				canvas.style.height = canvas.height / scale + 'px';
				canvas.style.width = canvas.width / scale + 'px';
				page.render({
					canvasContext: canvas.getContext('2d'),
					viewport: viewport,
				});
			}
		}
	}

	window.addEventListener('scroll', () => {
		let currentPage, currentPageNumber = pageNumber.value | 0;
		while (currentPage = document.getElementById('page' + currentPageNumber)) {
			const { bottom, top, height } = currentPage.getBoundingClientRect();
			const viewportHeight = document.documentElement.getBoundingClientRect().height;
			if (bottom < viewportHeight * .5 && bottom < height) {
				currentPageNumber += 1;
			} else if (top > viewportHeight * .5 || top > height) {
				currentPageNumber -= 1;
			} else {
				break;
			}
		}
		pageNumber.value = currentPageNumber;
	}, { passive: true });

	pageNumber.onchange = e => {
		const page = document.getElementById('page' + e.target.value);
		if (page) {
			page.scrollIntoView({ behavior: 'smooth' });
		}
	};

	document.body.classList.add('downloading');
	function onclickLoading() {
		promisePause = new Promise(resolve => {
			document.body.classList.remove('rendering');
			status.onclick = onclickPaused.bind(resolve);
		});
	};
	function onclickPaused() {
		document.body.classList.add('rendering');
		status.onclick = onclickLoading;
		this();
	};
	onclickPaused.bind(() => {})();

	try {
		const renderer = new Renderer(url);
		const rendering = renderer.render(window.devicePixelRatio);

		const pdfDocument = await renderer.loaded;
		document.body.classList.remove('downloading');
		
		browser.runtime.sendMessage({
			data: await pdfDocument.getData(),
			filename: renderer.filename,
		});
		document.title = filename.textContent = renderer.filename;
		await rendering;
	} catch (e) {
		// Header
		pageNumber.max = pageNumber.min = pageNumber.value = 0;
		pageLength.textContent = 0;
		// Main
		container.insertAdjacentHTML('beforeend', `<p class=error>Failed to load PDF file: ${e.message}</p>`);
		// Page Action
		browser.pageAction.hide(tabId);
	} finally {
		document.body.classList.remove('rendering');
		document.body.classList.add('rendered');
		status.onclick = null;
	}
})(location.href, document.getElementById('container'));

function detectPaparSize({ height, width }, scale = 1) {
	const [ mmH, mmW ] = [ height, width ].map(px => Math.round(px / scale / 96 * 25.4));
	const [ min, max ] = (mmH < mmW ? [ mmH, mmW ] : [ mmW, mmH ]);
	return {
		height: mmH,
		width: mmW,
		orientation: height < width ? 'landscape' : 'portrait',
		size: {
			'148x210': 'A5',
			'210x297': 'A4',
			'297x420': 'A3',
			'176x250': 'B5',
			'250x353': 'B4',
			'182x257': 'JIS-B5',
			'257x364': 'JIS-B4',
			'216x279': 'letter',
			'216x356': 'legal',
			'279x432': 'ledger',
		}[min + 'x' + max] || 'unknown',
	};
}