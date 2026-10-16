// Сервер всё равно приведёт аватар к 512×512, поэтому больше отправлять нет смысла
export const AVATAR_SIZE = 512;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось прочитать изображение"));
    img.src = src;
  });
}

// Вырезает выбранную в кропере область (в пикселях исходника) и возвращает квадратный blob для загрузки
export async function cropToBlob(src, area, size = AVATAR_SIZE) {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, size, size);

  // Браузер без поддержки WebP (старый Safari) молча отдаст PNG — сервер примет и его
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Не удалось обработать изображение"))),
      "image/webp",
      0.9,
    );
  });
}
