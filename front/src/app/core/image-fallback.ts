/**
 * A photo that cannot load – offline, in the installed app, nothing stores the photos – would
 * show the browser's broken-image icon, and on iOS nothing else: Safari does not draw the alt
 * text there. It gets a neutral placeholder instead (the site's light surface with an
 * "image off" icon) until the network is back, when every replaced photo is asked for again.
 * The alt text stays on the element for screen readers.
 *
 * The SVG has no size of its own, so it fills whatever box the image has (object-fit:
 * cover included) and the icon stays 24 px in the middle. Icon: Lucide "image-off" (ISC).
 */
const PLACEHOLDER =
    'data:image/svg+xml,' +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg">' +
            '<rect width="100%" height="100%" fill="#f3f5f2"/>' +
            '<svg x="50%" y="50%" overflow="visible">' +
            '<g transform="translate(-12 -12)" fill="none" stroke="#9aa39d" stroke-width="2" ' +
            'stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M2 2l20 20"/>' +
            '<path d="M10.41 10.41a2 2 0 1 1-2.83-2.83"/>' +
            '<path d="M13.5 13.5L6 21"/>' +
            '<path d="M18 12l3 3"/>' +
            '<path d="M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59"/>' +
            '<path d="M21 15V5a2 2 0 0 0-2-2H9"/>' +
            '</g></svg></svg>'
    );

/** The attributes a replaced image (or a <source> of its <picture>) had. */
interface Original {
    element: HTMLImageElement | HTMLSourceElement;
    src: string | null;
    srcset: string | null;
}

/**
 * Starts replacing images that fail to load; returns the function that stops it. Error
 * events do not bubble, so the listener sits on the document in the capture phase and sees
 * every <img>: the components' and the ones in CMS HTML alike.
 */
export function watchBrokenImages(doc: Document, view: Window): () => void {
    const replaced = new Map<HTMLImageElement, Original[]>();

    const onError = (event: Event) => {
        const image = event.target;
        if (!(image instanceof HTMLImageElement) || replaced.has(image)) return;
        if (image.currentSrc.startsWith('data:') || image.src.startsWith('data:')) return;
        // srcset (also on the <source> of a <picture>) wins over src, so it has to go too
        const sources =
            image.parentElement instanceof HTMLPictureElement
                ? [...image.parentElement.querySelectorAll('source')]
                : [];
        const originals: Original[] = [image, ...sources].map(element => ({
            element,
            src: element.getAttribute('src'),
            srcset: element.getAttribute('srcset')
        }));
        replaced.set(image, originals);
        for (const source of sources) source.removeAttribute('srcset');
        image.removeAttribute('srcset');
        image.src = PLACEHOLDER;
    };

    const onOnline = () => {
        const images = [...replaced];
        replaced.clear();
        for (const [image, originals] of images) {
            if (!image.isConnected) continue;
            // sources first, the image last: setting its src starts the new request
            for (const { element, src, srcset } of originals.slice().reverse()) {
                if (srcset !== null) element.setAttribute('srcset', srcset);
                if (src !== null) element.setAttribute('src', src);
                else element.removeAttribute('src');
            }
        }
    };

    doc.addEventListener('error', onError, true);
    view.addEventListener('online', onOnline);
    return () => {
        doc.removeEventListener('error', onError, true);
        view.removeEventListener('online', onOnline);
    };
}
