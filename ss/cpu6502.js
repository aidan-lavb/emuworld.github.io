// cpu6502.js
export class CPU6502 {
  constructor(bus) {
    this.bus = bus;
    
    // Registers
    this.a = 0x00;     // Accumulator
    this.x = 0x00;     // X Register
    this.y = 0x00;     // Y Register
    this.stkp = 0xFD;  // Stack Pointer
    this.pc = 0x0000;  // Program Counter
    this.status = 0x24;// Status Register (Flags)

    this.cycles = 0;   // Remaining cycles for current instruction
  }

  read(addr) { return this.bus.read(addr); }
  write(addr, data) { this.bus.write(addr, data); }

  reset() {
    const lo = this.read(0xFFFC);
    const hi = this.read(0xFFFD);
    this.pc = (hi << 8) | lo;

    this.a = 0;
    this.x = 0;
    this.y = 0;
    this.stkp = 0xFD;
    this.status = 0x24; 
    this.cycles = 0;
    
    console.log(`[CPU] Reset vector loaded. PC initialized to: 0x${this.pc.toString(16).padStart(4, '0')}`);
  }

  setZeroAndNegativeFlags(value) {
    if ((value & 0x00FF) === 0) {
      this.status |= 0x02; // Zero flag
    } else {
      this.status &= ~0x02;
    }

    if ((value & 0x0080) !== 0) {
      this.status |= 0x80; // Negative flag
    } else {
      this.status &= ~0x80;
    }
  }

  pushStack(val) {
    this.write(0x0100 + this.stkp, val);
    this.stkp = (this.stkp - 1) & 0xFF;
  }

  popStack() {
    this.stkp = (this.stkp + 1) & 0xFF;
    return this.read(0x0100 + this.stkp);
  }

  // Non-Maskable Interrupt (triggered by PPU during VBlank)
  nmi() {
    this.pushStack((this.pc >> 8) & 0xFF);
    this.pushStack(this.pc & 0xFF);
    this.pushStack(this.status & ~0x10); // Clear Break flag for hardware interrupt
    this.status |= 0x04;                 // Set Interrupt Disable flag
    
    const lo = this.read(0xFFFA);
    const hi = this.read(0xFFFB);
    this.pc = (hi << 8) | lo;
    
    this.cycles = 7;
  }

  debugLog(opcode) {
    const pcStr = this.pc.toString(16).padStart(4, '0').toUpperCase();
    const opStr = opcode.toString(16).padStart(2, '0').toUpperCase();
    const aStr = this.a.toString(16).padStart(2, '0').toUpperCase();
    const xStr = this.x.toString(16).padStart(2, '0').toUpperCase();
    const yStr = this.y.toString(16).padStart(2, '0').toUpperCase();
    const spStr = this.stkp.toString(16).padStart(2, '0').toUpperCase();
    const statusStr = this.status.toString(2).padStart(8, '0');

    console.log(`[CPU INFO] PC: $${pcStr} | OP: $${opStr} | A: $${aStr} X: $${xStr} Y: $${yStr} SP: $%${spStr} | NV-BDIZC: ${statusStr}`);
  }

  clock() {
    if (this.cycles === 0) {
      const opcode = this.read(this.pc);
      
      // Prints CPU execution info normally every instruction
      this.debugLog(opcode);

      this.pc = (this.pc + 1) & 0xFFFF;

      switch (opcode) {
        // --- System / Control ---
        case 0x00: // BRK
          this.pc = (this.pc + 1) & 0xFFFF;
          this.pushStack((this.pc >> 8) & 0xFF);
          this.pushStack(this.pc & 0xFF);
          this.pushStack(this.status | 0x10);
          this.status |= 0x04; // Set Interrupt Disable
          const lo = this.read(0xFFFE);
          const hi = this.read(0xFFFF);
          this.pc = (hi << 8) | lo;
          this.cycles = 7;
          break;

        case 0xEA: // NOP
          this.cycles = 2;
          break;

        // --- Loads (LDA, LDX, LDY) ---
        case 0xA9: // LDA Immediate
          this.a = this.read(this.pc);
          this.pc = (this.pc + 1) & 0xFFFF;
          this.setZeroAndNegativeFlags(this.a);
          this.cycles = 2;
          break;
        case 0xA5: // LDA Zero Page
          this.a = this.read(this.read(this.pc));
          this.pc = (this.pc + 1) & 0xFFFF;
          this.setZeroAndNegativeFlags(this.a);
          this.cycles = 3;
          break;
        case 0xAD: { // LDA Absolute
          const l = this.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF;
          const h = this.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF;
          this.a = this.read((h << 8) | l);
          this.setZeroAndNegativeFlags(this.a);
          this.cycles = 4;
          break;
        }

        case 0xA2: // LDX Immediate
          this.x = this.read(this.pc);
          this.pc = (this.pc + 1) & 0xFFFF;
          this.setZeroAndNegativeFlags(this.x);
          this.cycles = 2;
          break;
        case 0xA6: // LDX Zero Page
          this.x = this.read(this.read(this.pc));
          this.pc = (this.pc + 1) & 0xFFFF;
          this.setZeroAndNegativeFlags(this.x);
          this.cycles = 3;
          break;

        case 0xA0: // LDY Immediate
          this.y = this.read(this.pc);
          this.pc = (this.pc + 1) & 0xFFFF;
          this.setZeroAndNegativeFlags(this.y);
          this.cycles = 2;
          break;
        case 0xA4: // LDY Zero Page
          this.y = this.read(this.read(this.pc));
          this.pc = (this.pc + 1) & 0xFFFF;
          this.setZeroAndNegativeFlags(this.y);
          this.cycles = 3;
          break;

        // --- Stores (STA, STX, STY) ---
        case 0x85: // STA Zero Page
          this.write(this.read(this.pc), this.a);
          this.pc = (this.pc + 1) & 0xFFFF;
          this.cycles = 3;
          break;
        case 0x8D: { // STA Absolute
          const l = this.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF;
          const h = this.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF;
          this.write((h << 8) | l, this.a);
          this.cycles = 4;
          break;
        }

        case 0x86: // STX Zero Page
          this.write(this.read(this.pc), this.x);
          this.pc = (this.pc + 1) & 0xFFFF;
          this.cycles = 3;
          break;
        case 0x84: // STY Zero Page
          this.write(this.read(this.pc), this.y);
          this.pc = (this.pc + 1) & 0xFFFF;
          this.cycles = 3;
          break;

        // --- Register Transfers ---
        case 0xAA: this.x = this.a; this.setZeroAndNegativeFlags(this.x); this.cycles = 2; break; // TAX
        case 0xA8: this.y = this.a; this.setZeroAndNegativeFlags(this.y); this.cycles = 2; break; // TAY
        case 0x8A: this.a = this.x; this.setZeroAndNegativeFlags(this.a); this.cycles = 2; break; // TXA
        case 0x98: this.a = this.y; this.setZeroAndNegativeFlags(this.a); this.cycles = 2; break; // TYA
        case 0xBA: this.x = this.stkp; this.setZeroAndNegativeFlags(this.x); this.cycles = 2; break; // TSX
        case 0x9A: this.stkp = this.x; this.cycles = 2; break; // TXS

        // --- Increments & Decrements ---
        case 0xE8: this.x = (this.x + 1) & 0xFF; this.setZeroAndNegativeFlags(this.x); this.cycles = 2; break; // INX
        case 0xC8: this.y = (this.y + 1) & 0xFF; this.setZeroAndNegativeFlags(this.y); this.cycles = 2; break; // INY
        case 0xCA: this.x = (this.x - 1) & 0xFF; this.setZeroAndNegativeFlags(this.x); this.cycles = 2; break; // DEX
        case 0x88: this.y = (this.y - 1) & 0xFF; this.setZeroAndNegativeFlags(this.y); this.cycles = 2; break; // DEY

        // --- Jumps & Subroutines ---
        case 0x4C: { // JMP Absolute
          const l = this.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF;
          const h = this.read(this.pc);
          this.pc = (h << 8) | l;
          this.cycles = 3;
          break;
        }
        case 0x20: { // JSR Absolute
          const l = this.read(this.pc); this.pc = (this.pc + 1) & 0xFFFF;
          const h = this.read(this.pc);
          this.pushStack(((this.pc) >> 8) & 0xFF);
          this.pushStack((this.pc) & 0xFF);
          this.pc = (h << 8) | l;
          this.cycles = 6;
          break;
        }
        case 0x60: { // RTS
          const l = this.popStack();
          const h = this.popStack();
          this.pc = ((h << 8) | l) + 1 & 0xFFFF;
          this.cycles = 6;
          break;
        }

        // --- Logical & Bitwise ---
        case 0x29: // AND Immediate
          this.a &= this.read(this.pc);
          this.pc = (this.pc + 1) & 0xFFFF;
          this.setZeroAndNegativeFlags(this.a);
          this.cycles = 2;
          break;

        case 0x09: // ORA Immediate
          this.a |= this.read(this.pc);
          this.pc = (this.pc + 1) & 0xFFFF;
          this.setZeroAndNegativeFlags(this.a);
          this.cycles = 2;
          break;

        case 0x24: // BIT Zero Page
          {
            const val = this.read(this.read(this.pc));
            this.pc = (this.pc + 1) & 0xFFFF;
            if ((this.a & val) === 0) this.status |= 0x02; else this.status &= ~0x02;
            this.status = (this.status & 0x3F) | (val & 0xC0);
            this.cycles = 3;
          }
          break;

        // --- Comparisons (CMP) ---
        case 0xC9: // CMP Immediate
          {
            const val = this.read(this.pc);
            this.pc = (this.pc + 1) & 0xFFFF;
            const temp = this.a - val;
            if (this.a >= val) this.status |= 0x01; else this.status &= ~0x01;
            this.setZeroAndNegativeFlags(temp);
            this.cycles = 2;
          }
          break;

        // --- Branches ---
        case 0xD0: // BNE
        case 0xF0: // BEQ
        case 0x10: // BPL
        case 0x30: // BMI
        case 0x90: // BCC
        case 0xB0: // BCS
        {
          const offset = this.read(this.pc);
          this.pc = (this.pc + 1) & 0xFFFF;
          this.cycles = 2;

          let condition = false;
          if (opcode === 0xD0) condition = (this.status & 0x02) === 0;
          if (opcode === 0xF0) condition = (this.status & 0x02) !== 0;
          if (opcode === 0x10) condition = (this.status & 0x80) === 0;
          if (opcode === 0x30) condition = (this.status & 0x80) !== 0;
          if (opcode === 0x90) condition = (this.status & 0x01) === 0;
          if (opcode === 0xB0) condition = (this.status & 0x01) !== 0;

          if (condition) {
            this.cycles++;
            let signedOffset = offset;
            if (signedOffset & 0x80) signedOffset -= 256;
            this.pc = (this.pc + signedOffset) & 0xFFFF;
          }
          break;
        }

        // --- Status Flags ---
        case 0x18: this.status &= ~0x01; this.cycles = 2; break; // CLC
        case 0x38: this.status |= 0x01; this.cycles = 2; break; // SEC
        case 0x58: this.status &= ~0x04; this.cycles = 2; break; // CLI
        case 0x78: this.status |= 0x04; this.cycles = 2; break; // SEI

        default:
          this.cycles = 2;
          break;
      }
    }

    this.cycles--;
  }
}