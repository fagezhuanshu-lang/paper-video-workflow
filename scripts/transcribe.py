"""Optional local ASR. Produces unreviewed source-clock captions; never edits media."""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import sys


def event(stage, **data):
    print(json.dumps({'stage': stage, **data}, ensure_ascii=False), flush=True)


def stamp(seconds):
    value = max(0, round(seconds * 1000))
    hours, value = divmod(value, 3600000)
    minutes, value = divmod(value, 60000)
    seconds, milliseconds = divmod(value, 1000)
    return f'{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}'


def digest(file):
    result = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--video', type=Path, required=True)
    parser.add_argument('--out-dir', type=Path, required=True)
    parser.add_argument('--model', default='base')
    parser.add_argument('--model-cache', type=Path, required=True)
    parser.add_argument('--local-model', type=Path)
    args = parser.parse_args()
    if not args.video.is_file():
        raise ValueError('Input video does not exist')
    args.out_dir.mkdir(parents=True, exist_ok=True)
    args.model_cache.mkdir(parents=True, exist_ok=True)
    outputs = {name: args.out_dir / name for name in ('captions.json', 'captions.srt', 'full-transcript.txt', 'transcription-report.json')}
    if any(p.exists() for p in outputs.values()):
        raise ValueError('Output exists; use a new directory to preserve earlier captions and review')
    lock = args.out_dir / '.transcribe.lock'
    lock_fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    try:
        os.write(lock_fd, json.dumps({'pid': os.getpid()}).encode())
        from faster_whisper import WhisperModel
        package_version = importlib.metadata.version('faster-whisper')
        av_version = importlib.metadata.version('av')
        if package_version != '1.2.1' or av_version != '18.1.0':
            raise ValueError('Use the local pinned faster-whisper==1.2.1 and av==18.1.0 environment')
        cached_model = args.model_cache / args.model
        cached_complete = (cached_model / 'model.bin').is_file() and (cached_model / 'config.json').is_file()
        local_model = args.local_model or (cached_model if cached_complete else None)
        model_origin = 'local-directory' if args.local_model else 'local-model-cache' if cached_complete else 'public-model-download-or-cache'
        event('model-loading', model=args.model, local=bool(local_model), device='cpu', computeType='int8')
        model = WhisperModel(str(local_model) if local_model else args.model,
                             device='cpu', compute_type='int8', cpu_threads=min(8, os.cpu_count() or 4),
                             download_root=str(args.model_cache), local_files_only=bool(local_model))
        event('transcribing', ratio=0)
        segments, info = model.transcribe(str(args.video), beam_size=5, word_timestamps=False,
                                          vad_filter=True, condition_on_previous_text=False)
        captions = []
        for segment in segments:
            text = segment.text.strip()
            if text and segment.end > segment.start:
                captions.append({'start': float(segment.start), 'end': float(segment.end), 'text': text,
                                 'timingSource': 'faster-whisper-asr', 'reviewed': False})
                event('transcribing', segmentCount=len(captions), ratio=min(1, segment.end / max(info.duration, 0.001)))
        outputs['captions.json'].write_text(json.dumps(captions, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        outputs['captions.srt'].write_text('\n\n'.join(f'{i}\n{stamp(c["start"])} --> {stamp(c["end"])}\n{c["text"]}'
                                                     for i, c in enumerate(captions, 1)) + '\n', encoding='utf-8-sig')
        outputs['full-transcript.txt'].write_text('\n'.join(c['text'] for c in captions) + '\n', encoding='utf-8')
        report = {'status': 'needs-review' if captions else 'no-speech-detected', 'source': str(args.video.resolve()),
                  'sourceSha256': digest(args.video), 'clock': 'seconds from the beginning of the supplied video; no selected-clip offset applied',
                  'engine': 'faster-whisper', 'engineVersion': package_version, 'pyAvVersion': av_version,
                  'model': 'local-model-directory' if args.local_model else args.model, 'requestedModel': args.model,
                  'modelOrigin': model_origin,
                  'device': 'cpu', 'computeType': 'int8', 'language': info.language,
                  'languageProbability': float(info.language_probability), 'audioDuration': float(info.duration),
                  'segments': len(captions), 'vadFilter': True, 'wordTimestamps': False,
                  'review': {'transcriptChecked': False, 'timingChecked': False, 'semanticPlanChecked': False, 'coverSelectionChecked': False},
                  'mediaEdited': False, 'automaticCutsPerformed': False,
                  'notes': 'ASR wording and sentence timing require review against the actual source; errors do not authorize cuts or invented word timing.'}
        outputs['transcription-report.json'].write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        event('transcription-complete', segmentCount=len(captions), status=report['status'], ratio=1)
    finally:
        os.close(lock_fd)
        lock.unlink()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Avoid printing decoded narration or full model objects to the console.
        print(f'Transcription failed: {type(error).__name__}: {error}', file=sys.stderr)
        raise SystemExit(1)
