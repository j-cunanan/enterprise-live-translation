from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import azure.cognitiveservices.speech as speechsdk
from dotenv import load_dotenv
from datetime import datetime
import os
import asyncio
import json

load_dotenv()  # Load the environmental variables from .env file

class bcolors:  # Only to apply colors to the prints
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

app = FastAPI()  # Create a new FastAPI app

# Speech key and region from your Azure Speech Recognition service
speech_key = os.getenv("AZURE_SPEECH_KEY")
speech_region = os.getenv("AZURE_SPEECH_REGION")

def create_speech_transcriber(loop, queue, speech_recognition_language="en-US"):
    """
    Creates a conversation transcriber to enable realtime diarization.
    """
    speech_config = speechsdk.SpeechConfig(
        subscription=speech_key,
        region=speech_region
    )
    speech_config.speech_recognition_language = speech_recognition_language
    # Enable diarization for intermediate results.
    speech_config.set_property(
        property_id=speechsdk.PropertyId.SpeechServiceResponse_DiarizeIntermediateResults,
        value='true'
    )
    speech_config.set_property(property_id=speechsdk.PropertyId.SpeechServiceResponse_StablePartialResultThreshold, 
                               value='1')

    format = speechsdk.audio.AudioStreamFormat(
        compressed_stream_format=speechsdk.AudioStreamContainerFormat.ANY
    )
    stream = speechsdk.audio.PushAudioInputStream(format)
    audio_config = speechsdk.audio.AudioConfig(stream=stream)

    conversation_transcriber = speechsdk.transcription.ConversationTranscriber(
        speech_config=speech_config,
        audio_config=audio_config
    )

    def transcribed_cb(evt: speechsdk.SpeechRecognitionEventArgs):
        if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
            text = evt.result.text
            speaker = evt.result.speaker_id  # Diarization speaker id
            print(f"{bcolors.OKGREEN}Transcribed: {text} - Speaker: {speaker}{bcolors.ENDC}")
            message = json.dumps({
                "type": "final",
                "text": text,
                "speaker": speaker
            })
            asyncio.run_coroutine_threadsafe(
                queue.put(message),
                loop
            )
        elif evt.result.reason == speechsdk.ResultReason.NoMatch:
            print(f"{bcolors.FAIL}NoMatch: {evt.result.no_match_details}{bcolors.ENDC}")

    def transcribing_cb(evt: speechsdk.SpeechRecognitionEventArgs):
        text = evt.result.text
        speaker = evt.result.speaker_id
        print(f"{bcolors.OKCYAN}Transcribing: {text} - Speaker: {speaker}{bcolors.ENDC}")
        message = json.dumps({
            "type": "partial",
            "text": text,
            "speaker": speaker
        })
        asyncio.run_coroutine_threadsafe(
            queue.put(message),
            loop
        )

    def session_started_cb(evt: speechsdk.SessionEventArgs):
        print(f"{bcolors.OKBLUE}Conversation Transcriber session started.{bcolors.ENDC}")

    def session_stopped_cb(evt: speechsdk.SessionEventArgs):
        print(f"{bcolors.WARNING}Conversation Transcriber session stopped.{bcolors.ENDC}")

    def canceled_cb(evt: speechsdk.SessionEventArgs):
        print(f"{bcolors.FAIL}Conversation Transcriber canceled: {evt}{bcolors.ENDC}")

    conversation_transcriber.transcribed.connect(transcribed_cb)
    conversation_transcriber.transcribing.connect(transcribing_cb)
    conversation_transcriber.session_started.connect(session_started_cb)
    conversation_transcriber.session_stopped.connect(session_stopped_cb)
    conversation_transcriber.canceled.connect(canceled_cb)

    return conversation_transcriber, stream

@app.websocket("/ws/transcriptions")
async def audio_streaming(websocket: WebSocket):
    await websocket.accept()
    
    # Get language from query parameters
    language_code = websocket.query_params.get("language", "en")
    
    # Map language code to speech recognition code
    language_map = {
        "en": "en-US",
        "es": "es-ES",
        "fr": "fr-FR",
        "de": "de-DE",
        "ja": "ja-JP"
    }
    
    speech_recognition_language = language_map.get(language_code, "en-US")
    
    loop = asyncio.get_event_loop()
    message_queue = asyncio.Queue()

    # Create the conversation transcriber with the selected language
    conversation_transcriber, stream = create_speech_transcriber(loop, message_queue, speech_recognition_language)

    async def receive_audio(websocket, stream):
        audio_data = b""
        print(f"{bcolors.OKGREEN}WebSocket -> Receiving audio from client and saving into stream...{bcolors.ENDC}")
        while True:
            try:
                data = await websocket.receive_bytes()
                audio_data += data
                stream.write(data)
                print(f"{bcolors.OKCYAN}WebSocket -> Stream data in bytes: {len(data)}{bcolors.ENDC}")
            except WebSocketDisconnect:
                print(f"{bcolors.FAIL}Conversation Transcriber -> Stream closed{bcolors.ENDC}")
                stream.close()

                print(f"{bcolors.OKBLUE}API -> WebSocket client disconnected!{bcolors.ENDC}")
                print(f"{bcolors.OKBLUE}API -> Stopping transcription...{bcolors.ENDC}")
                conversation_transcriber.stop_transcribing_async()
                print(f"{bcolors.OKBLUE}API -> Transcription stopped!{bcolors.ENDC}")
                print(f"{bcolors.OKBLUE}API -> Exporting audio data to a file...{bcolors.ENDC}")
                with open(f"records/received_audio_{datetime.now()}.webm", "wb") as f:
                    f.write(audio_data)
                    print(f"{bcolors.OKBLUE}API -> Audio data exported!{bcolors.ENDC}")
                break
            except Exception as e:
                print(f"Error: {e}")
                break

    async def send_messages():
        while True:
            message = await message_queue.get()
            await websocket.send_text(message)

    try:
        # Start conversation transcription asynchronously
        conversation_transcriber.start_transcribing_async()
        print("API -> Conversation transcription running with diarization enabled...")
        await asyncio.gather(receive_audio(websocket, stream), send_messages())
    except Exception as e:
        print(f"Error: {e}")