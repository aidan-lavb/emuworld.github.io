// script.js
import { Bus } from './bus.js';
import { CPU6502 } from './cpu6502.js';
import { PPU2C02 } from './ppu2c02.js';

document.addEventListener('DOMContentLoaded', () => {
  const libraryView = document.getElementById('library-view');
  const playerView = document.getElementById('player-view');
  const launchBtn = document.getElementById('launch-nes');
  const backBtn = document.getElementById('back-btn');
  const romInput = document.getElementById('rom-input');
  const screenOverlay = document.querySelector('.screen-overlay');
  
  const canvas = document.getElementById('nes-canvas');
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(256, 240);

  // Core Selector Elements
  const btnCustom = document.getElementById('btn-custom-core');
  const btnJsnes = document.getElementById('btn-jsnes-core');
  let activeCore = 'custom'; // 'custom' or 'jsnes'

  // Initialize Custom Hardware Components
  const bus = new Bus();
  const cpu = new CPU6502(bus);
  const ppu = new PPU2C02(bus);
  bus.attachCPU(cpu);
  bus.attachPPU(ppu);

  // Initialize JSNES Instance (if global JSNES is loaded)
  let jsnesConsole = null;
  if (typeof JSNES !== 'undefined') {
    jsnesConsole = new JSNES.Console({
      onFrame: (buffer) => {
        if (activeCore === 'jsnes') {
          const data32 = new Uint32Array(imageData.data.buffer);
          for (let i = 0; i < buffer.length; i++) {
            data32[i] = 0xFF000000 | buffer[i];
          }
          ctx.putImageData(imageData, 0, 0);
        }
      },
      onAudioSample: () => {}
    });
  }

  let animationFrameId = null;
  let rawRomBuffer = null;

  // View Navigation
  launchBtn.addEventListener('click', () => {
    libraryView.classList.add('hidden');
    playerView.classList.remove('hidden');
  });

  backBtn.addEventListener('click', () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    playerView.classList.add('hidden');
    libraryView.classList.remove('hidden');
  });

  // Core Switching Logic
  btnCustom.addEventListener('click', () => {
    activeCore = 'custom';
    btnCustom.classList.add('active');
    btnJsnes.classList.remove('active');
    console.log("[EMULATOR] Switched to Custom Core");
    restartCurrentCore();
  });

  btnJsnes.addEventListener('click', () => {
    if (typeof JSNES === 'undefined') {
      alert("JSNES library not found! Include the JSNES script tag in index.html to use this core.");
      return;
    }
    activeCore = 'jsnes';
    btnJsnes.classList.add('active');
    btnCustom.classList.remove('active');
    console.log("[EMULATOR] Switched to JSNES Core");
    restartCurrentCore();
  });

  function restartCurrentCore() {
    if (!rawRomBuffer) return;
    screenOverlay.style.display = 'none';

    if (activeCore === 'custom') {
      bus.loadROM(rawRomBuffer);
      cpu.reset();
    } else if (activeCore === 'jsnes' && jsnesConsole) {
      // JSNES expects a binary string or byte array depending on version
      let binaryStr = '';
      for (let i = 0; i < rawRomBuffer.length; i++) {
        binaryStr += String.fromCharCode(rawRomBuffer[i]);
      }
      jsnesConsole.loadROM(binaryStr);
    }
  }

  // ROM Loader
  romInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = function (event) {
      rawRomBuffer = new Uint8Array(event.target.result);
      restartCurrentCore();

      if (!animationFrameId) {
        runCoreLoop();
      }
    };
  });

  // Main Emulation Timing Loop
  function runCoreLoop() {
    animationFrameId = requestAnimationFrame(runCoreLoop);

    if (activeCore === 'custom' && rawRomBuffer) {
      // NTSC Frame Cycle Budget (~29,780 CPU cycles per frame)
      for (let i = 0; i < 29780; i++) {
        cpu.clock();
        ppu.clock();
        ppu.clock();
        ppu.clock();
      }

      // Render Custom PPU Framebuffer to HTML Canvas
      const data32 = new Uint32Array(imageData.data.buffer);
      data32.set(ppu.frameBuffer);
      ctx.putImageData(imageData, 0, 0);

    } else if (activeCore === 'jsnes' && jsnesConsole && rawRomBuffer) {
      jsnesConsole.frame();
    }
  }

  // NES Controller Bit Mapping
  const KEY_MAP = {
    'KeyX': 0,     // A
    'KeyZ': 1,     // B
    'Shift': 2,    // Select
    'Enter': 3,    // Start
    'ArrowUp': 4,    // Up
    'ArrowDown': 5,  // Down
    'ArrowLeft': 6,  // Left
    'ArrowRight': 7  // Right
  };

  window.addEventListener('keydown', (e) => {
    if (KEY_MAP[e.code] !== undefined) {
      if (activeCore === 'custom') {
        bus.setControllerButton(KEY_MAP[e.code], true);
      } else if (activeCore === 'jsnes' && jsnesConsole) {
        // Map keys to JSNES controller player 1
        const jsnesKeys = [
          jsnesConsole.KEY_A, jsnesConsole.KEY_B, jsnesConsole.KEY_SELECT, jsnesConsole.KEY_START,
          jsnesConsole.KEY_UP, jsnesConsole.KEY_DOWN, jsnesConsole.KEY_LEFT, jsnesConsole.KEY_RIGHT
        ];
        jsnesConsole.buttonDown(1, jsnesKeys[KEY_MAP[e.code]]);
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (KEY_MAP[e.code] !== undefined) {
      if (activeCore === 'custom') {
        bus.setControllerButton(KEY_MAP[e.code], false);
      } else if (activeCore === 'jsnes' && jsnesConsole) {
        const jsnesKeys = [
          jsnesConsole.KEY_A, jsnesConsole.KEY_B, jsnesConsole.KEY_SELECT, jsnesConsole.KEY_START,
          jsnesConsole.KEY_UP, jsnesConsole.KEY_DOWN, jsnesConsole.KEY_LEFT, jsnesConsole.KEY_RIGHT
        ];
        jsnesConsole.buttonUp(1, jsnesKeys[KEY_MAP[e.code]]);
      }
    }
  });

  // On-Screen Touch / Click Controls
  const bindControls = (selector) => {
    document.querySelectorAll(selector).forEach((btn) => {
      const buttonId = KEY_MAP[btn.dataset.key];
      if (buttonId === undefined) return;

      const press = (e) => { 
        e.preventDefault(); 
        if (activeCore === 'custom') {
          bus.setControllerButton(buttonId, true);
        } else if (jsnesConsole) {
          const jsnesKeys = [
            jsnesConsole.KEY_A, jsnesConsole.KEY_B, jsnesConsole.KEY_SELECT, jsnesConsole.KEY_START,
            jsnesConsole.KEY_UP, jsnesConsole.KEY_DOWN, jsnesConsole.KEY_LEFT, jsnesConsole.KEY_RIGHT
          ];
          jsnesConsole.buttonDown(1, jsnesKeys[buttonId]);
        }
      };

      const release = (e) => { 
        e.preventDefault(); 
        if (activeCore === 'custom') {
          bus.setControllerButton(buttonId, false);
        } else if (jsnesConsole) {
          const jsnesKeys = [
            jsnesConsole.KEY_A, jsnesConsole.KEY_B, jsnesConsole.KEY_SELECT, jsnesConsole.KEY_START,
            jsnesConsole.KEY_UP, jsnesConsole.KEY_DOWN, jsnesConsole.KEY_LEFT, jsnesConsole.KEY_RIGHT
          ];
          jsnesConsole.buttonUp(1, jsnesKeys[buttonId]);
        }
      };

      btn.addEventListener('touchstart', press);
      btn.addEventListener('touchend', release);
      btn.addEventListener('mousedown', press);
      btn.addEventListener('mouseup', release);
      btn.addEventListener('mouseleave', release);
    });
  };

  bindControls('.dpad-btn');
  bindControls('.pill-btn');
  bindControls('.action-btn');
});