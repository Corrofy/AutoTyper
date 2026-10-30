/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { KeyboardSoundType } from '../types/extension.ts';

class KeyboardSoundEngine {
  private audioCtx: AudioContext | null = null;

  private init() {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  public playKeypress(soundType: KeyboardSoundType, volume: number = 0.3, isSpace: boolean = false, isEnter: boolean = false) {
    if (soundType === 'silent' || volume <= 0) return;

    try {
      this.init();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const gainNode = this.audioCtx.createGain();
      gainNode.connect(this.audioCtx.destination);

      const baseVol = Math.max(0.01, Math.min(1.0, volume * 0.4));

      if (soundType === 'cherry-blue') {
        // Crisp, high-pitched mechanical tactile click
        const osc = this.audioCtx.createOscillator();
        const clickFreq = isEnter ? 980 : isSpace ? 820 : 1200 + (Math.random() * 300 - 150);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(clickFreq, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.025);

        // Filtered noise snap for switch bottom-out
        const bufferSize = this.audioCtx.sampleRate * 0.02;
        const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }
        const whiteNoise = this.audioCtx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;

        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(isSpace ? 1400 : 2800, now);
        filter.Q.setValueAtTime(3.5, now);

        gainNode.gain.setValueAtTime(baseVol * 0.9, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

        osc.connect(gainNode);
        whiteNoise.connect(filter);
        filter.connect(gainNode);

        osc.start(now);
        whiteNoise.start(now);
        osc.stop(now + 0.035);
        whiteNoise.stop(now + 0.035);
      } else if (soundType === 'cherry-brown') {
        // Deeper, rounded tactile thock
        const osc = this.audioCtx.createOscillator();
        const clickFreq = isEnter ? 420 : isSpace ? 340 : 540 + (Math.random() * 80 - 40);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(clickFreq, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.03);

        gainNode.gain.setValueAtTime(baseVol * 0.75, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

        osc.connect(gainNode);
        osc.start(now);
        osc.stop(now + 0.035);
      } else if (soundType === 'cherry-red') {
        // Smooth linear bottom-out clack
        const osc = this.audioCtx.createOscillator();
        const clickFreq = isSpace ? 280 : 380 + (Math.random() * 60 - 30);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(clickFreq, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.028);

        gainNode.gain.setValueAtTime(baseVol * 0.5, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

        osc.connect(gainNode);
        osc.start(now);
        osc.stop(now + 0.03);
      }
    } catch {
      // Audio playback fails gracefully if blocked by autoplay policy
    }
  }
}

export const keyboardSound = new KeyboardSoundEngine();
