# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- GitHub Actions workflow for automated testing on main branch
- GitHub Actions workflow for automated publishing to GitHub Packages on tag push
- Optional workflow for publishing to npm registry
- Consolidated VAD events to reduce redundancy
- Frame size alignment for Silero VAD (512 samples)

### Changed
- Removed energy-based VAD, now exclusively using Silero VAD
- Consolidated `speech-segment` event emission from SileroVAD
- Removed unused `probability` event from SileroVAD
- Removed `returnProbabilities` configuration option

### Fixed
- VAD frame alignment issues with different capture frame sizes (20/40/60ms)

## [0.1.0] - 2024-XX-XX

### Added
- Initial release of Realtime Audio SDK
- Audio capture with AudioWorklet
- Silero VAD integration with ONNX Runtime
- Opus encoding via WebCodecs API
- PCM fallback for browsers without WebCodecs
- Device management with hot-plug detection
- Unified event system for audio data
- Speech state and segment detection
- Comprehensive documentation and examples