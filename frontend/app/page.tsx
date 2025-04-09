"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Globe, Mic, StopCircle, AlertCircle, Loader2, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const Page = () => {
  const { toast } = useToast();
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [transcription, setTranscription] = useState<string>(""); // final transcription
  const [partial, setPartial] = useState<string>(""); // temporary partial result
  const [translatedText, setTranslatedText] = useState<string>(""); // MS Translator output
  const [gptTranslatedText, setGptTranslatedText] = useState<string>(""); // GPT 4o-mini output
  const [sourceLanguage, setSourceLanguage] = useState<string>("en"); // Default source language
  const [targetLanguage, setTargetLanguage] = useState<string>("ja"); // Default target language
  const [activeTab, setActiveTab] = useState<string>("live");
  const [msLatencies, setMsLatencies] = useState<number[]>([]);
  const [gptLatencies, setGptLatencies] = useState<number[]>([]);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isMsTranslating, setIsMsTranslating] = useState<boolean>(false);
  const [isGptTranslating, setIsGptTranslating] = useState<boolean>(false);
  const [translationContext, setTranslationContext] = useState<string>(
    `The speaker is Jayson, from Insights and Data of Capgemini. You can shorten that to I&D Japan. Keep the use of words under a business scenario.
For translation style: Always keep the flow of translation that sounds natural like a native speaker.`
  );
  const [tempContext, setTempContext] = useState<string>("");

  // Language mapping for better display
  const languages = {
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    ja: "Japanese"
  };

  // Get color for speaker based on speaker ID
  const getSpeakerColor = (speaker: string) => {
    const colors = [
      "text-blue-600 dark:text-blue-400",
      "text-emerald-600 dark:text-emerald-400",
      "text-purple-600 dark:text-purple-400",
      "text-amber-600 dark:text-amber-400",
      "text-rose-600 dark:text-rose-400",
      "text-indigo-600 dark:text-indigo-400"
    ];

    const match = speaker.match(/Guest-(\d+)/);
    if (match) {
      const guestNumber = parseInt(match[1], 10);
      return colors[(guestNumber - 1) % colors.length];
    }

    let hash = 0;
    for (let i = 0; i < speaker.length; i++) {
      hash = speaker.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  // Helper: get the last 10 non-empty lines
  const getLastTenLines = (text: string) =>
    text.split("\n").filter((line) => line.trim() !== "").slice(-10).join("\n");

  const translateTranscription = async () => {
    const lastTenLines = getLastTenLines(transcription);
    if (!lastTenLines) return;
    try {
      setIsMsTranslating(true);
      const startTime = performance.now();
      const subscriptionKey = process.env.NEXT_PUBLIC_MS_TRANSLATOR_SUBSCRIPTION_KEY;
      const region = process.env.NEXT_PUBLIC_MS_TRANSLATOR_REGION;
      if (!subscriptionKey || !region) {
        toast({
          title: "Configuration Error",
          description: "MS Translator key or region is not set.",
          variant: "destructive",
        });
        return;
      }
      const endpoint = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=${sourceLanguage}&to=${targetLanguage}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Ocp-Apim-Subscription-Key": subscriptionKey,
          "Ocp-Apim-Subscription-Region": region,
        },
        body: JSON.stringify([{ Text: lastTenLines }]),
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();
      if (data && data[0]?.translations?.[0]?.text) {
        setTranslatedText(data[0].translations[0].text);
        const newLatency = performance.now() - startTime;
        setMsLatencies((prev) => {
          const transcriptionLines = transcription.split("\n").filter((line) => line.trim() !== "");
          const translatedLines = data[0].translations[0].text.split("\n").filter((line) => line.trim() !== "");
          const newArr = [...prev];
          const startIndex = transcriptionLines.length - translatedLines.length;
          for (let i = 0; i < translatedLines.length; i++) {
            if (newArr[startIndex + i] === undefined) {
              newArr[startIndex + i] = newLatency;
            }
          }
          return newArr;
        });
      }
    } catch (error) {
      console.error("Error translating text:", error);
      toast({
        title: "Translation Error",
        description: "Failed to translate using MS Translator.",
        variant: "destructive",
      });
    } finally {
      setIsMsTranslating(false);
    }
  };

  const translateUsingGpt = async () => {
    const lastTenLines = getLastTenLines(transcription);
    if (!lastTenLines) return;
    try {
      setIsGptTranslating(true);
      const startTime = performance.now();
      const response = await fetch("/api/gpt-translation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: lastTenLines,
          source: sourceLanguage,
          target: targetLanguage,
          context: translationContext, // Include the context
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const data = await response.json();
      if (data && data.translation) {
        setGptTranslatedText(data.translation);
        const newLatency = performance.now() - startTime;
        setGptLatencies((prev) => {
          const transcriptionLines = transcription.split("\n").filter((line) => line.trim() !== "");
          const translatedLines = data.translation.split("\n").filter((line) => line.trim() !== "");
          const newArr = [...prev];
          const startIndex = transcriptionLines.length - translatedLines.length;
          for (let i = 0; i < translatedLines.length; i++) {
            if (newArr[startIndex + i] === undefined) {
              newArr[startIndex + i] = newLatency;
            }
          }
          return newArr;
        });
      }
    } catch (error) {
      console.error("Error in GPT translation:", error);
      toast({
        title: "Translation Error",
        description: "Failed to translate using GPT 4o-mini.",
        variant: "destructive",
      });
    } finally {
      setIsGptTranslating(false);
    }
  };

  useEffect(() => {
    if (transcription) {
      translateTranscription();
      translateUsingGpt();
    }
  }, [transcription, sourceLanguage, targetLanguage]);

  const startMicrophone = async () => {
    try {
      const wsConn = new WebSocket(`ws://localhost:8001/ws/transcriptions?language=${sourceLanguage}`);
      setWs(wsConn);
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs:opus" });
      setMediaRecorder(recorder);
      setIsRecording(true);

      wsConn.onopen = () => console.log("WebSocket connected");
      wsConn.onerror = (e) => {
        console.error("WebSocket error:", e);
        toast({
          title: "Connection Error",
          description: "WebSocket error. Please check your setup.",
          variant: "destructive",
        });
        stopMicrophone();
      };
      wsConn.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "final") {
            setTranscription((prev) => prev + `${data.speaker}: ${data.text}\n`);
            setPartial("");
          } else if (data.type === "partial") {
            setPartial(data.text);
          }
        } catch (err) {
          console.error("Parsing error:", err);
          toast({
            title: "Data Error",
            description: "Error processing transcription data.",
            variant: "destructive",
          });
        }
      };

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && wsConn.readyState === WebSocket.OPEN) {
          wsConn.send(e.data);
        }
      };

      recorder.start(100);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      toast({
        title: "Microphone Error",
        description: "Could not access microphone. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  const stopMicrophone = () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      setMediaRecorder(null);
    }
    if (ws) {
      ws.close();
      setWs(null);
    }
    setIsRecording(false);
  };

  // Format translated text with speaker information and colors
  const formatTranslatedText = (translatedText: string, originalText: string) => {
    const translatedLines = translatedText.split('\n').filter(line => line.trim());
    const originalLines = originalText.split('\n').filter(line => line.trim());
    
    return (
      <>
        {translatedLines.map((line, idx) => {
          if (!line.trim()) return null;

          // Get the corresponding original line to extract speaker
          const originalLine = originalLines[idx] || "";
          const [speaker] = originalLine.split(": ");
          
          // Remove repeated guest prefix from translation (e.g., "Guest-1:" or "ゲスト1:") if it exists
          const guestPrefixPattern = /^(Guest-\d+:\s*|ゲスト[-\s]*\d+:\s*)/;
          const cleanedLine = line.replace(guestPrefixPattern, "").trim();

          if (speaker && originalLine.includes(": ")) {
            return (
              <div key={idx} className="mb-1">
                <span className={`font-semibold ${getSpeakerColor(speaker)}`}>{speaker}: </span>
                <span>{cleanedLine}</span>
              </div>
            );
          }

          return <div key={idx} className="mb-1">{cleanedLine}</div>;
        })}
      </>
    );
  };

  // Prepare outputs
  const limitedTranscription = getLastTenLines(transcription);

  // Display partial transcript differently
  const displayTranscription = (
    <>
      {limitedTranscription.split('\n').map((line, idx) => {
        if (!line.trim()) return null;

        const [speaker, ...textParts] = line.split(": ");
        const lineText = textParts.join(": ");

        return (
          <div key={idx} className="mb-1">
            <span className={`font-semibold ${getSpeakerColor(speaker)}`}>{speaker}: </span>
            <span>{lineText}</span>
          </div>
        );
      })}
      {partial && (
        <span className="text-muted-foreground italic inline-flex items-center">
          {partial}
          <span className="ml-1 w-1.5 h-3 bg-foreground/70 animate-pulse rounded-sm" />
        </span>
      )}
    </>
  );

  const limitedMsTranslation = getLastTenLines(translatedText);
  const limitedGptTranslation = getLastTenLines(gptTranslatedText);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center space-x-2">
          <Globe className="w-6 h-6" aria-hidden="true" />
          <h1 className="text-2xl font-bold">Live Translation</h1>
        </div>
        <div className="flex items-center space-x-2">
          {/* Add this Dialog component */}
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Settings">
                <Settings className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[525px]">
              <DialogHeader>
                <DialogTitle>Translation Settings</DialogTitle>
                <DialogDescription>
                  Customize how the GPT translation service interprets your content.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <label htmlFor="context" className="text-sm font-medium mb-2 block">
                  Translation Context
                </label>
                <Textarea
                  id="context"
                  rows={5}
                  placeholder="Provide context for the translation"
                  className="w-full"
                  value={tempContext || translationContext}
                  onChange={(e) => setTempContext(e.target.value)}
                />
                <p className="text-sm text-muted-foreground mt-2">
                  Example: "The speaker is a marketing professional. Maintain formal language for a business presentation."
                </p>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    if (tempContext) {
                      setTranslationContext(tempContext);
                      setTempContext("");
                    }
                  }}
                >
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {isRecording ? (
            <Button 
              onClick={stopMicrophone} 
              variant="destructive"
              aria-label="Stop recording"
            >
              <StopCircle className="w-5 h-5 mr-2" aria-hidden="true" />
              Stop
            </Button>
          ) : (
            <Button 
              onClick={startMicrophone} 
              variant="default"
              aria-label="Start recording"
            >
              <Mic className="w-5 h-5 mr-2" aria-hidden="true" />
              Start
            </Button>
          )}
          {isRecording && (
            <Badge variant="outline" className="bg-red-50 text-red-500 border-red-200 animate-pulse">
              Recording
            </Badge>
          )}
        </div>
      </header>

      {/* Language Selection */}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 border-b">
        <div>
          <label htmlFor="source-language" className="block mb-1 font-medium">From</label>
          <Select value={sourceLanguage} onValueChange={setSourceLanguage}>
            <SelectTrigger id="source-language" className="w-full" aria-label="Source language">
              <SelectValue placeholder="Select language">
                {languages[sourceLanguage as keyof typeof languages]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="es">Spanish</SelectItem>
              <SelectItem value="fr">French</SelectItem>
              <SelectItem value="de">German</SelectItem>
              <SelectItem value="ja">Japanese</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor="target-language" className="block mb-1 font-medium">To</label>
          <Select value={targetLanguage} onValueChange={setTargetLanguage}>
            <SelectTrigger id="target-language" className="w-full" aria-label="Target language">
              <SelectValue placeholder="Select language">
                {languages[targetLanguage as keyof typeof languages]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="es">Spanish</SelectItem>
              <SelectItem value="fr">French</SelectItem>
              <SelectItem value="de">German</SelectItem>
              <SelectItem value="ja">Japanese</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content Tabs */}
      <div className="p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2" role="tablist">
            <TabsTrigger value="live" role="tab">Live Preview</TabsTrigger>
            <TabsTrigger value="details" role="tab">Detailed View</TabsTrigger>
          </TabsList>
          <TabsContent value="live" className="mt-4" role="tabpanel">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Transcription</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="whitespace-pre-wrap text-sm">{displayTranscription}</pre>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row justify-between items-center pb-2">
                  <CardTitle>MS Translator</CardTitle>
                  {isMsTranslating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </CardHeader>
                <CardContent>
                  <div className="whitespace-pre-wrap text-sm">
                    {formatTranslatedText(limitedMsTranslation, limitedTranscription)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row justify-between items-center pb-2">
                  <CardTitle>GPT 4o-mini</CardTitle>
                  {isGptTranslating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </CardHeader>
                <CardContent>
                  <div className="whitespace-pre-wrap text-sm">
                    {formatTranslatedText(limitedGptTranslation, limitedTranscription)}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          <TabsContent value="details" className="mt-4" role="tabpanel">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm" aria-label="Translation comparison">
                <thead>
                  <tr className="bg-muted text-center">
                    <th scope="col" className="border px-4 py-2">Line #</th>
                    <th scope="col" className="border px-4 py-2">Speaker</th>
                    <th scope="col" className="border px-4 py-2">Transcription</th>
                    <th scope="col" className="border px-4 py-2">MS Translator</th>
                    <th scope="col" className="border px-4 py-2">GPT 4o-mini</th>
                    <th scope="col" className="border px-4 py-2">Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const transcriptionLines = transcription.split("\n").filter((line) => line.trim() !== "");
                    const msLines = translatedText.split("\n").filter((line) => line.trim() !== "");
                    const gptLines = gptTranslatedText.split("\n").filter((line) => line.trim() !== "");
                    const maxLines = Math.max(transcriptionLines.length, msLines.length, gptLines.length);
                    return Array.from({ length: maxLines }).map((_, idx) => {
                      const line = transcriptionLines[idx] || "";
                      const [speaker, ...textParts] = line.split(": ");
                      const lineText = textParts.join(": ");
                      return (
                        <tr key={idx} className="text-center hover:bg-muted/50">
                          <td className="border px-2 py-2 sm:px-4">{idx + 1}</td>
                          <td className={`border px-2 py-2 sm:px-4 font-medium ${textParts.length ? getSpeakerColor(speaker) : ""}`}>
                            {textParts.length ? speaker : ""}
                          </td>
                          <td className="border px-2 py-2 sm:px-4 text-left">{textParts.length ? lineText : line}</td>
                          <td className="border px-2 py-2 sm:px-4 text-left">{msLines[idx] || ""}</td>
                          <td className="border px-2 py-2 sm:px-4 text-left">{gptLines[idx] || ""}</td>
                          <td className="border px-2 py-2 sm:px-4">
                            {(msLatencies[idx] !== undefined || gptLatencies[idx] !== undefined)
                              ? (
                                <div className="flex flex-col sm:flex-row sm:space-x-1 text-xs sm:text-sm justify-center">
                                  <span>MS: {msLatencies[idx] !== undefined ? msLatencies[idx].toFixed(0) : "-"} ms</span>
                                  <span className="hidden sm:inline">/</span>
                                  <span>GPT: {gptLatencies[idx] !== undefined ? gptLatencies[idx].toFixed(0) : "-"} ms</span>
                                </div>
                              )
                              : "-"
                            }
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Page;