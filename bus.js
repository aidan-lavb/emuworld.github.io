// bus.js
export class Bus {
  constructor() {
    this.ram = new Uint8Array(2048);
    this.rom = null;                 // PRG-ROM
    this.chrRom = null;              // CHR-ROM (Graphics pattern tables)
    this.cpu = null;
    this.ppu = null;
    this.controller1State = 0;
    this.controller1Latch = 0;
    this.controller1Shift = 0;
  }

  attachCPU(cpu) { this.cpu = cpu; }
  attachPPU(ppu) { this.ppu = ppu; }

  loadROM(romUint8Array) {
    if (
      romUint8Array[0] !== 0x4E || 
      romUint8Array[1] !== 0x45 || 
      romUint8Array[2] !== 0x53 || 
      romUint8Array[3] !== 0x1A
    ) {
      console.error("Invalid iNES ROM format!");
      return;
    }

    const prgPageCount = romUint8Array[4];
    const chrPageCount = romUint8Array[5];

    const prgSize = prgPageCount * 16384;
    const chrSize = chrPageCount * 8192;

    const hasTrainer = (romUint8Array[6] & 0x04) !== 0;
    let romOffset = 16;
    if (hasTrainer) {
      romOffset += 512;
    }

    this.rom = romUint8Array.subarray(romOffset, romOffset + prgSize);
    this.chrRom = romUint8Array.subarray(romOffset + prgSize, romOffset + prgSize + chrSize);

    console.log(`ROM Loaded successfully: PRG: ${prgSize} bytes, CHR: ${chrSize} bytes`);
  }

  // CPU Memory Read
  read(addr) {
    if (addr < 0x2000) {
      return this.ram[addr & 0x07FF];
    } else if (addr >= 0x2000 && addr < 0x4000) {
      return this.ppu ? this.ppu.readRegister(addr & 0x0007) : 0;
    } else if (addr === 0x4016) {
      const val = (this.controller1Shift & 0x80) ? 1 : 0;
      this.controller1Shift = (this.controller1Shift << 1) & 0xFF;
      return val;
    } else if (addr >= 0x8000) {
      const index = (addr - 0x8000) % this.rom.length;
      return this.rom[index];
    }
    return 0;
  }

  // CPU Memory Write
  write(addr, value) {
    value &= 0xFF;
    if (addr < 0x2000) {
      this.ram[addr & 0x07FF] = value;
    } else if (addr >= 0x2000 && addr < 0x4000) {
      if (this.ppu) this.ppu.writeRegister(addr & 0x0007, value);
    } else if (addr === 0x4016) {
      this.controller1Latch = value & 1;
      if (this.controller1Latch) {
        this.controller1Shift = this.controller1State;
      }
    }
  }

  // PPU Memory Read (0x0000 - 0x3FFF)
  ppuRead(addr) {
    addr &= 0x3FFF;
    if (addr < 0x2000) {
      return this.chrRom ? this.chrRom[addr % this.chrRom.length] : 0;
    } else if (addr >= 0x2000 && addr < 0x3F00) {
      // Nametables (2KB VRAM with mirroring)
      return this.ppu ? this.ppu.vram[addr & 0x07FF] : 0;
    }
    return 0;
  }

  // PPU Memory Write
  ppuWrite(addr, value) {
    addr &= 0x3FFF;
    if (addr >= 0x2000 && addr < 0x3F00) {
      if (this.ppu) this.ppu.vram[addr & 0x07FF] = value & 0xFF;
    }
  }

  setControllerButton(buttonId, pressed) {
    if (pressed) {
      this.controller1State |= (1 << buttonId);
    } else {
      this.controller1State &= ~(1 << buttonId);
    }
    if (this.controller1Latch) {
      this.controller1Shift = this.controller1State;
    }
  }
}