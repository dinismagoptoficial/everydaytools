import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
for (const dir of ["cmaps", "standard_fonts", "wasm"]) {
  await mkdir(`public/pdf/${dir}`, { recursive: true });
  await cp(`node_modules/pdfjs-dist/${dir}`, `public/pdf/${dir}`, {
    recursive: true,
  });
}

const notices = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const path = `${directory}/${entry.name}`;
    if (entry.name.startsWith("@")) {
      await collect(path);
      continue;
    }
    const names = await readdir(path);
    const metadata = names.includes("package.json")
      ? JSON.parse(await readFile(`${path}/package.json`, "utf8"))
      : {};
    for (const name of names.filter((name) =>
      /^(licen[cs]e|notice|copying)([.-]|$)/i.test(name),
    )) {
      try {
        notices.push(
          `${metadata.name || entry.name} ${metadata.version || ""}\n${name}\n\n${await readFile(`${path}/${name}`, "utf8")}`,
        );
      } catch (error) {
        if (error.code !== "EISDIR") throw error;
      }
    }
    if (names.includes("node_modules")) await collect(`${path}/node_modules`);
  }
}
await collect("node_modules");
await writeFile(
  "public/third-party-licenses.txt",
  notices.join(
    "\n\n============================================================\n\n",
  ),
);
