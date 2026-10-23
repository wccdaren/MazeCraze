import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const images = {};
for (const name of (await readdir(new URL("assets/", root)))
  .filter((name) => name.endsWith(".png") && name !== "gnome.png")
  .sort())
  images[name] =
    `data:image/png;base64,${(await readFile(new URL(`assets/${name}`, root))).toString("base64")}`;
const data = {
  images,
  samples: { 1: await read("maps/map-1.txt"), 2: await read("maps/map-2.txt") },
};
const modules = await Promise.all(
  ["js/spec.js", "js/editor-model.js", "js/playtest-protocol.js", "js/editor-app.js"].map(read),
);
const code = modules
  .map((source) =>
    source
      .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?\s*$/gm, "")
      .replace(/^export /gm, ""),
  )
  .join("\n\n");
const bundled = `const EDITOR_BUNDLED = ${JSON.stringify(data).replace(/</g, "\\u003c")};\n${code}`;
const script = `<script>\n'use strict';\n(() => {\n${bundled.replace(/<\/script/gi, "<\\/script")}\n})();\n</script>`;
const css = await read("editor.css");
const html = (await read("editor-shell.html"))
  .replace("/*EDITOR_CSS*/", () => css)
  .replace("<!--EDITOR_SCRIPT-->", () => script);
await writeFile(new URL("editor.html", root), html);
console.log(
  `Built ${fileURLToPath(new URL("editor.html", root))}: ${Buffer.byteLength(html).toLocaleString()} bytes, no external scripts or styles.`,
);
