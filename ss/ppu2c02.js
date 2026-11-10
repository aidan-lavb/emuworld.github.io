// ppu2c02.js
export class PPU2C02 {
  constructor(bus) {
    this.bus = bus;
    this.vram = new Uint8Array(2048);         // 2KB Nametable VRAM
    this.palette = new Uint8Array(32);
    this.frameBuffer = new Uint32Array(256 * 240); 
    this.scanline = 0;
    this.cycle = 0;

    // PPU Registers
    this.ppuCtrl = 0;
    this.ppuStatus = 0;
    this.ppuAddr = 0;
    this.addrLatch = false;
    this.ppuDataBuffer = 0;
  }

  read(addr) {
    return this.bus ? this.bus.ppuRead(addr) : 0;
  }

  write(addr, data) {
    if (this.bus) this.bus.ppuWrite(addr, data);
  }

  // Read PPU Registers ($2000 - $2007)
  readRegister(addr) {
    let data = 0;
    switch (addr & 0x0007) {
      case 0x0002: // PPUSTATUS
        data = this.ppuStatus;
        this.ppuStatus &= ~0x80; // Clear VBL flag on read
        this.addrLatch = false;  // Reset address latch
        break;

      case 0x0007: // PPUDATA Read
        data = this.ppuDataBuffer;
        this.ppuDataBuffer = this.read(this.ppuAddr);
        const inc = (this.ppuCtrl & 0x04) ? 32 : 1;
        this.ppuAddr = (this.ppuAddr + inc) & 0x3FFF;
        break;
    }
    return data;
  }

  // Write PPU Registers ($2000 - $2007)
  writeRegister(addr, data) {
    switch (addr & 0x0007) {
      case 0x0000: // PPUCTRL
        this.ppuCtrl = data;
        break;

      case 0x0005: // PPUSCROLL
        break;

      case 0x0006: // PPUADDR
        if (!this.addrLatch) {
          this.ppuAddr = (this.ppuAddr & 0x00FF) | ((data & 0x3F) << 8);
          this.addrLatch = true;
        } else {
          this.ppuAddr = (this.ppuAddr & 0xFF00) | data;
          this.addrLatch = false;
        }
        break;

      case 0x0007: // PPUDATA
        this.write(this.ppuAddr, data);
        const inc = (this.ppuCtrl & 0x04) ? 32 : 1;
        this.ppuAddr = (this.ppuAddr + inc) & 0x3FFF;
        break;
    }
  }

  clock() {
    this.cycle++;
    if (this.cycle >= 341) {
      this.cycle = 0;
      this.scanline++;

      // VBlank starts at scanline 241
      if (this.scanline === 241) {
        this.ppuStatus |= 0x80; // Set VBlank flag

        // Trigger NMI if enabled via PPUCTRL ($2000 bit 7)
        if ((this.ppuCtrl & 0x80) && this.bus && this.bus.cpu) {
          this.bus.cpu.nmi();
        }
      }

      if (this.scanline >= 262) {
        this.scanline = 0;
        this.ppuStatus &= ~0x80; // Clear VBlank flag
        this.renderFrame();
      }
    }
  }

  renderFrame() {
    if (this.bus && this.bus.chrRom) {
      for (let row = 0; row < 30; row++) {
        for (let col = 0; col < 32; col++) {
          const nametableAddress = 0x2000 + (row * 32) + col;
          const tileIndex = this.read(nametableAddress);
          this.drawTile(tileIndex, col * 8, row * 8);
        }
      }
    } else {
      for (let i = 0; i < this.frameBuffer.length; i++) {
        const x = i % 256;
        const y = Math.floor(i / 256);
        this.frameBuffer[i] = 0xFF101020 | ((x + y + this.scanline) & 0xFF);
      }
    }
  }

  drawTile(tileIndex, xOffset, yOffset) {
    const tileAddress = tileIndex * 16;

    for (let row = 0; row < 8; row++) {
      let plane0 = this.read(tileAddress + row);
      let plane1 = this.read(tileAddress + row + 8);

      for (let col = 0; col < 8; col++) {
        const bit = 7 - col;
        const p0 = (plane0 >> bit) & 1;
        const p1 = (plane1 >> bit) & 1;
        const pixelColor = (p1 << 1) | p0;

        const colors = [0xFF111111, 0xFF5555FF, 0xFFAAAAAA, 0xFFFFFFFF];
        const color = colors[pixelColor];

        const screenX = xOffset + col;
        const screenY = yOffset + row;

        if (screenX >= 0 && screenX < 256 && screenY >= 0 && screenY < 240) {
          this.frameBuffer[screenY * 256 + screenX] = color;
        }
      }
    }
  }
}