let imagesList = [];
let failedList = [];
let videosList = [];
let galleryStatus = "loading";

// Notify background that gallery page is ready to receive images
chrome.runtime.sendMessage({ type: "gallery-ready" });

// Receive images/videos array from background
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "init-images" && Array.isArray(message.images)) {
    imagesList = message.images;
    failedList = Array.isArray(message.failed) ? message.failed : [];
    videosList = Array.isArray(message.videos) ? message.videos : [];
    galleryStatus = message.status || "ready";
    populateGallery(imagesList, failedList, videosList, galleryStatus);
  }
});

// Populate gallery grouped by file type, and videos
function populateGallery(images, failed, videos, status) {
  const gallery = document.getElementById("gallery");
  // Only remove loading if content is ready
  if (status !== "ready") {
    let loading = document.getElementById("loading");
    if (!loading) {
      loading = document.createElement("div");
      loading.id = "loading";
      loading.className = "loading";
      loading.textContent = "Loading...";
      gallery.appendChild(loading);
    }
    gallery.innerHTML = "";
    gallery.appendChild(loading);
    return;
  }
  // Remove loading message if present
  const loading = document.getElementById("loading");
  if (loading) loading.remove();
  gallery.innerHTML = "";

  if (failed && failed.length > 0) {
    const warn = document.createElement("div");
    warn.textContent = `${failed.length} images could not be zipped due to site restrictions. You can still view and download them below.`;
    warn.className = "warning";
    gallery.appendChild(warn);
  }

  // Images
  const groups = images.reduce((acc, dataURL) => {
    const match = dataURL.match(/^data:image\/([a-zA-Z]+)/);
    const ext = match ? match[1] : "unknown";
    (acc[ext] = acc[ext] || []).push({ src: dataURL, failed: false });
    return acc;
  }, {});

  // Add failed images as direct links
  if (failed && failed.length > 0) {
    (groups["unavailable"] = groups["unavailable"] || []).push(
      ...failed.map((url) => ({ src: url, failed: true }))
    );
  }

  Object.entries(groups).forEach(([ext, list]) => {
    const section = document.createElement("section");
    const title = document.createElement("h2");
    if (ext === "unavailable") {
      title.textContent = "Direct download only (CORS)";
    } else {
      title.textContent = ext;
    }
    section.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "grid";

    list.forEach((item) => {
      const card = document.createElement("div");
      card.className = "card";
      if (item.failed) {
        // Try to render the image directly
        const img = document.createElement("img");
        img.src = item.src;
        img.alt = "Direct image (CORS)";
        img.style.maxWidth = "100%";
        img.style.maxHeight = "100%";
        card.appendChild(img);
        // Download link
        const link = document.createElement("a");
        link.href = item.src;
        link.download = "";
        link.textContent = "Download";
        link.style.display = "block";
        link.style.marginTop = "6px";
        link.style.fontSize = "12px";
        card.appendChild(link);
      } else {
        const img = document.createElement("img");
        img.src = item.src;
        card.appendChild(img);
      }
      grid.appendChild(card);
    });

    section.appendChild(grid);
    gallery.appendChild(section);
  });

  // Videos
  if (videos && videos.length > 0) {
    // Group by extension
    const videoGroups = videos.reduce((acc, url) => {
      const extMatch = url.match(/\.([a-z0-9]+)(\?|$)/i);
      const ext = extMatch ? extMatch[1].toLowerCase() : "video";
      (acc[ext] = acc[ext] || []).push(url);
      return acc;
    }, {});
    Object.entries(videoGroups).forEach(([ext, list]) => {
      const section = document.createElement("section");
      const title = document.createElement("h2");
      title.textContent = `Videos (${ext})`;
      section.appendChild(title);
      const grid = document.createElement("div");
      grid.className = "grid";
      list.forEach((url) => {
        const card = document.createElement("div");
        card.className = "card";
        const video = document.createElement("video");
        video.src = url;
        video.controls = true;
        video.style.maxWidth = "100%";
        video.style.maxHeight = "100%";
        card.appendChild(video);
        const link = document.createElement("a");
        link.href = url;
        link.download = "";
        link.textContent = "Download";
        link.style.display = "block";
        link.style.marginTop = "6px";
        link.style.fontSize = "12px";
        card.appendChild(link);
        grid.appendChild(card);
      });
      section.appendChild(grid);
      gallery.appendChild(section);
    });
  }
}

// Handle download all button
document.getElementById("downloadAll").addEventListener("click", downloadAll);

function downloadAll() {
  const zip = new JSZip();
  const groups = imagesList.reduce((acc, dataURL) => {
    const match = dataURL.match(/^data:image\/([a-zA-Z]+)/);
    const ext = match ? match[1] : "unknown";
    (acc[ext] = acc[ext] || []).push(dataURL);
    return acc;
  }, {});

  Object.entries(groups).forEach(([ext, list]) => {
    const folder = zip.folder(ext);
    list.forEach((dataURL, idx) => {
      const base64 = dataURL.split(",")[1];
      folder.file(`image${idx + 1}.${ext}`, base64, { base64: true });
    });
  });

  zip.generateAsync({ type: "blob" }).then((blob) => {
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: "images.zip", saveAs: true });
  });
}
