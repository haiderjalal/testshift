/** Small uncompressed ZIP writer for the fixed source bundle; no customer paths or archive extraction. */
export function sourceZip(files: { name: string; data: string }[]): Buffer {
  const entries: Buffer[] = []; const index: Buffer[] = []; let offset = 0;
  const crc32 = (data: Buffer) => {
    let crc = 0xffffffff;
    for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    return (crc ^ 0xffffffff) >>> 0;
  };
  for (const file of files) {
    if (!/^[A-Za-z0-9_./-]+$/.test(file.name) || file.name.startsWith("/") || file.name.split("/").includes("..")) throw new Error("Invalid bundle path");
    const name = Buffer.from(file.name); const data = Buffer.from(file.data); const crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    entries.push(local, name, data);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    index.push(central, name); offset += local.length + name.length + data.length;
  }
  const directory = Buffer.concat(index); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...entries, directory, end]);
}
