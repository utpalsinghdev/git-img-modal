# GitHub Image Preview

A dependency-free Chrome Manifest V3 extension that opens eligible images in an accessible in-page viewer instead of navigating away. It also works in Brave.

## Install in Brave

1. Open `brave://extensions`.
2. Turn on **Developer mode**.
3. Select **Load unpacked** and choose this project's `extension` directory.
4. Visit or reload a page containing an eligible image.

## Use

Click an image to open the viewer. Use **100% / Fit** to switch between fitting the image to the window and viewing it at its original size. Close with the close button, Escape, or a click on the backdrop. Tab and Shift+Tab cycle through the viewer controls. The viewer shows the image's alt text or title, its load state, and a link to the original image when one is available.

Use the **left and right arrow buttons** or **← / →** keys to browse the page's images. The gallery starts at the image you clicked, shows your position, and wraps around at either end. Each image starts in fit mode.

Use **↑** to zoom in and **↓** to zoom out in 25% steps. Zoom ranges from 5% to 800% of the image's original size. Use the scrollbars to explore a zoomed image, **Fit** to reset its size, and **Escape** to close the gallery.

While the gallery is open, it preloads and decodes up to **five images ahead and five behind**, or all available images on shorter pages. Ready images appear immediately when selected. The cache moves with you, keeps at most eleven images, and releases them when the gallery closes. Loading can still take time if you navigate faster than the connection can preload images.

The gallery collects unique, previewable images in page order when you open it, including images below the fold. Hidden images, avatars, logos, controls, and unrelated linked cards are skipped. It only uses image URLs already present on the current page; it does not crawl linked pages or scroll to load more results. Reopen the gallery after the page adds more images to include them.

The extension handles GitHub Markdown images, direct image links, and unlinked content images on HTTP and HTTPS pages. For linked images, it intercepts only image-like targets (including GitHub blob images and GitHub asset, user-attachment, and camo URLs), so linked cards and other non-image links keep their normal behavior. It ignores modified, middle, and right clicks, plus images inside interactive controls and common avatar, profile, navigation, and logo areas.

## Privacy

The extension runs on HTTP and HTTPS websites so it can intercept image clicks. It has no background service worker, remote dependencies, tracking, or uploads. While the viewer is open, it loads the selected image and nearby gallery images directly from their existing hosts. If a URL fails, the viewer tries the currently displayed image URL. It cannot run on browser settings pages or the Chrome Web Store.
