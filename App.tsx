
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ImageUpload } from './components/ImageUpload';
import { Button } from './components/Button';
import { ChatInterface } from './components/ChatInterface';
import { ImageCropper } from './components/ImageCropper';
import { generateEditedImage } from './services/geminiService';
import { generateInstantVideo } from './services/clientVideoService';
import { saveHistoryItem, getHistory, deleteHistoryItem, clearHistoryDB } from './services/storageService';
import { DEFAULT_PROMPT, BACKGROUND_PRESETS, QUALITY_MODIFIERS, LIGHTING_STYLES, COLOR_GRADING_STYLES, PROMPT_SUGGESTIONS, LOADING_MESSAGES } from './constants';
import { ProcessingState, AspectRatio, HistoryItem, Language, ChatMessage, SavedPrompt, BackgroundConfig, QualityMode, LightingIntensity, ColorGradingStyle, Theme } from './types';
import { translations } from './translations';

function App() {
  const [language, setLanguage] = useState<Language>('en');
  const [theme, setTheme] = useState<Theme>('dark');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>(DEFAULT_PROMPT);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [quality, setQuality] = useState<QualityMode>('high');
  const [status, setStatus] = useState<ProcessingState>({ isLoading: false, error: null });
  const [isCustomPromptOpen, setIsCustomPromptOpen] = useState(true); // Default open for better discovery
  const [history, setHistory] = useState<HistoryItem[]>([]);
  
  // Cropper State
  const [isCropping, setIsCropping] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);

  // Loading Message State
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  // New Advanced Settings - Defaults updated per request
  const [skinTexture, setSkinTexture] = useState<boolean>(true);
  const [faceDetail, setFaceDetail] = useState<number>(75); 
  const [lighting, setLighting] = useState<LightingIntensity>('dramatic');
  const [colorGrading, setColorGrading] = useState<ColorGradingStyle>('teal_orange');
  
  // Animation State
  const [isAnimating, setIsAnimating] = useState(false);
  const [videoResult, setVideoResult] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'image' | 'video'>('image');

  // Background State
  const [backgroundConfig, setBackgroundConfig] = useState<BackgroundConfig>({ type: 'preset', value: 'default' });
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // Saved Prompts State
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [isNamingPreset, setIsNamingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  // Logo Data URI (Sobh Omid - Yellow BG, Green Text)
  const LOGO_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23facc15"/><path d="M50 5 C 25 5 5 25 5 50 C 5 75 25 95 50 95 C 75 95 95 75 95 50 C 95 25 75 5 50 5 Z" fill="%23facc15"/><text x="50" y="45" font-family="Tahoma, Arial, sans-serif" font-weight="bold" font-size="30" text-anchor="middle" fill="%2314532d">صبح</text><text x="50" y="78" font-family="Tahoma, Arial, sans-serif" font-weight="bold" font-size="30" text-anchor="middle" fill="%2314532d">امید</text></svg>`;

  const t = translations[language];

  // Apply Theme Class
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Rotate Loading Messages
  useEffect(() => {
    let interval: any;
    if (status.isLoading && !isAnimating) {
      setLoadingMessageIndex(0);
      interval = setInterval(() => {
        setLoadingMessageIndex(prev => (prev + 1) % LOADING_MESSAGES.length);
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [status.isLoading, isAnimating]);

  // Load saved prompts from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('cinematic_ai_saved_prompts');
    if (saved) {
      try {
        setSavedPrompts(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved prompts", e);
      }
    }
  }, []);

  // Load history from IndexedDB on mount
  useEffect(() => {
    getHistory().then(items => {
      setHistory(items);
    }).catch(err => console.error("Failed to load history", err));
  }, []);

  // Save prompts to local storage whenever they change
  useEffect(() => {
    localStorage.setItem('cinematic_ai_saved_prompts', JSON.stringify(savedPrompts));
  }, [savedPrompts]);

  // Helper to add to history (and storage)
  const addToHistory = async (image: string, p: string, ar: AspectRatio) => {
    const newItem: HistoryItem = {
      id: Date.now().toString() + Math.random().toString(36).substring(2),
      imageUrl: image,
      prompt: p,
      aspectRatio: ar,
      timestamp: Date.now(),
      skinTexture,
      faceDetail,
      lighting,
      colorGrading
    };
    
    // Update State
    setHistory(prev => [newItem, ...prev]);
    
    // Save to DB
    try {
      await saveHistoryItem(newItem);
    } catch (e) {
      console.error("Failed to save history item", e);
    }
  };

  const handleClearHistory = async () => {
    if (window.confirm(language === 'fa' ? 'آیا مطمئن هستید که می‌خواهید تمام تاریخچه را پاک کنید؟' : 'Are you sure you want to clear all history?')) {
      try {
        await clearHistoryDB();
        setHistory([]);
      } catch (e) {
        console.error("Failed to clear history", e);
      }
    }
  };

  const handleDeleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteHistoryItem(id);
      setHistory(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      console.error("Failed to delete item", err);
    }
  };

  // When a new image is selected, reset the result
  const handleImageSelected = useCallback((base64: string) => {
    if (base64) {
      setSelectedImage(base64);
    } else {
      setSelectedImage(null);
    }
    setResultImage(null);
    setVideoResult(null);
    setActiveTab('image');
    setStatus({ isLoading: false, error: null });
    setChatMessages([]); 
  }, []);

  // Crop Logic
  const startCrop = () => {
    if (selectedImage) {
      setImageToCrop(selectedImage);
      setIsCropping(true);
    }
  };

  const handleCropComplete = (croppedBase64: string) => {
    setSelectedImage(croppedBase64);
    setIsCropping(false);
    setImageToCrop(null);
  };

  const handleGenerate = async () => {
    if (!selectedImage) return;

    setStatus({ isLoading: true, error: null });
    setResultImage(null);
    setVideoResult(null);
    setActiveTab('image');
    setChatMessages([]);

    try {
      // Construct final prompt with all settings
      let finalPrompt = prompt;

      // 1. Skin Texture
      if (skinTexture) {
        finalPrompt += ", hyper-realistic skin texture, subtle pores, natural imperfections, authentic skin details";
      }

      // 2. Face Detail Intensity (0-100)
      if (faceDetail > 75) {
         finalPrompt += ", ultra-detailed facial features, sharp focus on eyes and lips, micro-details";
      } else if (faceDetail > 50) {
         finalPrompt += ", detailed facial features, clear focus";
      } else if (faceDetail < 25) {
         finalPrompt += ", soft focus, smooth features";
      }

      // 3. Lighting Style
      finalPrompt += `, ${LIGHTING_STYLES[lighting]}`;

      // 4. Color Grading
      if (colorGrading !== 'none') {
        finalPrompt += `, ${COLOR_GRADING_STYLES[colorGrading]}`;
      }

      // 5. General Quality
      finalPrompt += QUALITY_MODIFIERS[quality];
      
      // 6. Background settings
      if (backgroundConfig.type === 'preset' && backgroundConfig.value !== 'default') {
        const preset = BACKGROUND_PRESETS.find(p => p.id === backgroundConfig.value);
        if (preset) {
           finalPrompt += `, ${preset.prompt}`;
        }
      } else if (backgroundConfig.type === 'custom_color') {
         finalPrompt += `, solid ${backgroundConfig.value} color background`;
      }

      const generatedImageBase64 = await generateEditedImage(selectedImage, finalPrompt, aspectRatio);
      setResultImage(generatedImageBase64);
      await addToHistory(generatedImageBase64, finalPrompt, aspectRatio);
    } catch (error: any) {
      setStatus({ 
        isLoading: false, 
        error: error.message || t.errorGeneric 
      });
    } finally {
      setStatus(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleAnimate = async () => {
    if (!resultImage) return;

    setIsAnimating(true);
    setStatus({ isLoading: true, error: null });
    try {
      // Use client-side generation (Instant, no API Key)
      const videoUrl = await generateInstantVideo(resultImage);
      setVideoResult(videoUrl);
      setActiveTab('video');
    } catch (error: any) {
      console.error("Animation failed", error);
      setStatus({ isLoading: false, error: error.message || "Animation failed" });
    } finally {
      setIsAnimating(false);
      setStatus(prev => prev.error ? prev : { ...prev, isLoading: false });
    }
  };

  const handleChatEdit = async (text: string) => {
    // Determine source image: use result if available, otherwise original
    const sourceImage = resultImage || selectedImage;
    if (!sourceImage) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: text,
      timestamp: Date.now()
    };
    setChatMessages(prev => [...prev, userMsg]);
    setStatus({ isLoading: true, error: null });
    setVideoResult(null);
    setActiveTab('image');

    try {
      let editPrompt = text;
      editPrompt += QUALITY_MODIFIERS[quality];
      editPrompt += `, ${LIGHTING_STYLES[lighting]}`;

      const newImage = await generateEditedImage(sourceImage, editPrompt, aspectRatio);
      setResultImage(newImage);
      await addToHistory(newImage, editPrompt, aspectRatio);

      const modelMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: language === 'fa' ? 'تصویر ویرایش شد.' : 'Image updated.',
        timestamp: Date.now()
      };
      setChatMessages(prev => [...prev, modelMsg]);

    } catch (error: any) {
      setStatus({ 
        isLoading: false, 
        error: error.message || t.errorGeneric 
      });
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: language === 'fa' ? 'خطا در ویرایش تصویر.' : 'Failed to edit image.',
        timestamp: Date.now()
      };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setStatus(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleDownload = async () => {
    if (activeTab === 'video' && videoResult) {
       const link = document.createElement('a');
       link.href = videoResult;
       link.download = `cinematic-video-${Date.now()}.webm`;
       document.body.appendChild(link);
       link.click();
       document.body.removeChild(link);
       return;
    }

    if (resultImage) {
      try {
        const response = await fetch(resultImage);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `cinematic-portrait-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (e) {
        console.error("Download failed", e);
        const link = document.createElement('a');
        link.href = resultImage;
        link.download = `cinematic-portrait-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
  };

  const restoreHistoryItem = (item: HistoryItem) => {
    setResultImage(item.imageUrl);
    setPrompt(item.prompt.split(',')[0]);
    setAspectRatio(item.aspectRatio);
    if (item.skinTexture !== undefined) setSkinTexture(item.skinTexture);
    if (item.faceDetail !== undefined) setFaceDetail(item.faceDetail);
    if (item.lighting) setLighting(item.lighting);
    if (item.colorGrading) setColorGrading(item.colorGrading);
    
    setVideoResult(null);
    setActiveTab('image');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setChatMessages([]);
  };

  const ASPECT_RATIOS: AspectRatio[] = ["AUTO", "1:1", "3:4", "4:3", "9:16", "16:9", "21:9"];

  return (
    <div dir={language === 'fa' ? 'rtl' : 'ltr'} className={`min-h-screen flex flex-col font-sans transition-colors duration-500 selection:bg-blue-500/30 selection:text-blue-200 overflow-x-hidden relative
      ${theme === 'dark' 
        ? 'bg-gray-950 text-gray-100' 
        : 'bg-gray-50 text-gray-900'
      }`}>
      
      {/* Cinematic Animated Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-noise opacity-[0.03] mix-blend-overlay"></div>
        {/* Floating Orbs */}
        <div className="absolute top-[-10%] left-[10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px] mix-blend-screen animate-float"></div>
        <div className="absolute bottom-[0%] right-[5%] w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[130px] mix-blend-screen animate-floatSlow"></div>
        <div className="absolute top-[30%] left-[40%] w-[300px] h-[300px] bg-teal-500/10 rounded-full blur-[100px] mix-blend-screen animate-pulseSlow"></div>
      </div>

      {/* Content Wrapper */}
      <div className="relative z-10 flex flex-col min-h-screen">
        
        {/* Cropper Modal */}
        {isCropping && imageToCrop && (
          <ImageCropper
            imageSrc={imageToCrop}
            onCropComplete={handleCropComplete}
            onCancel={() => { setIsCropping(false); setImageToCrop(null); }}
            confirmLabel={t.applyCrop}
            cancelLabel={t.cancelCrop}
            instructions={t.cropInstructions}
          />
        )}

        {/* Floating Glass Header */}
        <header className="sticky top-0 z-30 transition-all duration-300 backdrop-blur-md bg-white/70 dark:bg-black/30 border-b border-white/20 dark:border-white/5">
          <div className="container mx-auto px-4 md:px-8 py-3 flex items-center justify-between max-w-7xl">
            <div className="flex items-center gap-4 group">
              {/* Logo with Glow Effect */}
              <div className="relative w-12 h-12 rounded-full overflow-hidden border border-yellow-400/50 bg-yellow-400 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(250,204,21,0.3)] hover:scale-110 transition-transform duration-500">
                  <img
                    src={LOGO_SVG}
                    alt="Sobh Omid Logo"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </div>
              
              <div className="flex flex-col">
                  <h1 className="text-xl md:text-2xl font-black tracking-tight text-gray-900 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-white dark:to-gray-300 drop-shadow-sm">
                    {t.instituteName}
                  </h1>
                  <span className="text-xs md:text-xs text-blue-600 dark:text-blue-400 font-bold tracking-[0.2em] uppercase opacity-80">
                    {t.appTitle}
                  </span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Theme Toggle */}
              <button
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className="p-2.5 rounded-full bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10 transition-all hover:scale-110 active:scale-95 shadow-sm"
                title={theme === 'light' ? t.themeDark : t.themeLight}
              >
                {theme === 'light' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                  </svg>
                )}
              </button>

              <div className="flex items-center p-1 bg-white/50 dark:bg-black/30 border border-gray-200 dark:border-white/10 rounded-full backdrop-blur-md">
                <button 
                  onClick={() => setLanguage('en')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all ${language === 'en' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-md' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
                >
                  En
                </button>
                <button 
                  onClick={() => setLanguage('fa')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all ${language === 'fa' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-md' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
                >
                  فا
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Workspace */}
        <main className="flex-1 container mx-auto px-4 py-8 max-w-[1400px]">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-16">
            
            {/* LEFT PANEL: Control Center */}
            <section className="lg:col-span-4 flex flex-col gap-6 animate-slideUp" style={{ animationDelay: '0.1s' }}>
              
              {/* Floating Tool Palette */}
              <div className="bg-white/80 dark:bg-[#13151a]/60 backdrop-blur-xl rounded-[2rem] p-6 border border-white/20 dark:border-white/10 shadow-2xl overflow-hidden relative group">
                  
                  {/* Decorative Glow */}
                  <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-500/10 rounded-full blur-[50px] pointer-events-none"></div>

                  <div className="space-y-1 mb-6 relative z-10">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 uppercase tracking-wide">
                      <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>
                      {t.uploadTitle}
                    </h2>
                    <p className="text-gray-500 dark:text-gray-400 text-xs pl-4">{t.uploadDesc}</p>
                  </div>

                  <div className="relative group/upload mb-6">
                    <ImageUpload 
                      onImageSelected={handleImageSelected} 
                      selectedImage={selectedImage}
                    />
                    {selectedImage && (
                      <button
                        onClick={startCrop}
                        className="absolute top-3 left-3 bg-black/60 hover:bg-blue-600/90 text-white p-2.5 rounded-full backdrop-blur-md transition-all z-10 shadow-lg hover:scale-110 border border-white/10"
                        title={t.cropImage}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7.875 6.125a1.875 1.875 0 113.75 0 1.875 1.875 0 01-3.75 0zM1.5 8.625v5.875c0 1.036.84 1.875 1.875 1.875 1.875h1.375v3.875A2.25 2.25 0 007 22.5h8a2.25 2.25 0 002.25-2.25v-1.375c1.035 0 1.875-.84 1.875-1.875V8.625A2.25 2.25 0 0016.875 6.375h-1.875A1.875 1.875 0 0113.125 4.5a2.25 2.25 0 00-2.25-2.25h-2.25A2.25 2.25 0 006.375 4.5a1.875 1.875 0 01-1.875 1.875H2.625A1.125 1.125 0 001.5 7.5v1.125z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 2.25L15.75 22.5" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Accordion Style Settings */}
                  <div className="bg-gray-50/50 dark:bg-white/5 rounded-2xl overflow-hidden border border-gray-100 dark:border-white/5 transition-colors hover:border-blue-500/30">
                     <button 
                      onClick={() => setIsCustomPromptOpen(!isCustomPromptOpen)}
                      className="flex items-center justify-between w-full px-5 py-4 text-left text-sm font-bold text-gray-700 dark:text-gray-200 hover:text-blue-500 dark:hover:text-blue-400 transition-colors bg-white/50 dark:bg-transparent"
                     >
                       <span className="flex items-center gap-3">
                         <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-500">
                           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                             <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                           </svg>
                         </div>
                         {t.settings}
                       </span>
                       <div className={`p-1.5 rounded-full bg-gray-200 dark:bg-white/10 transition-transform duration-300 ${isCustomPromptOpen ? 'rotate-180' : ''}`}>
                         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3">
                           <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                         </svg>
                       </div>
                     </button>
                     
                     {isCustomPromptOpen && (
                       <div className="px-5 pb-5 pt-2 space-y-6 animate-fadeIn">
                         
                         {/* Aspect Ratio */}
                         <div className="space-y-3">
                          <label className="text-[10px] uppercase text-gray-400 font-bold tracking-widest">{t.aspectRatio}</label>
                          <div className="grid grid-cols-7 gap-1.5">
                            {ASPECT_RATIOS.map((ratio) => {
                              const isSelected = aspectRatio === ratio;
                              const getDims = (r: string) => r === 'AUTO' ? [20, 20] : r.split(':').map(Number);
                              const [w, h] = getDims(ratio);
                              const scale = Math.min(16 / w, 16 / h);
                              return (
                              <button
                                key={ratio}
                                onClick={() => setAspectRatio(ratio)}
                                className={`
                                  flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-lg transition-all duration-200 border relative overflow-hidden group/ratio
                                  ${isSelected
                                    ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]' 
                                    : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10 hover:text-gray-200'}
                                `}
                              >
                                <div className="h-4 flex items-center justify-center z-10">
                                   {ratio === 'AUTO' ? (
                                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                                      </svg>
                                   ) : (
                                     <div 
                                       className={`border-2 rounded-sm ${isSelected ? 'border-white bg-white/20' : 'border-current opacity-40'}`}
                                       style={{ width: `${w * scale}px`, height: `${h * scale}px` }}
                                     />
                                   )}
                                </div>
                                <span className="text-[8px] font-bold tracking-wider z-10">{ratio === 'AUTO' ? t.ratioAuto : ratio}</span>
                              </button>
                            )})}
                          </div>
                         </div>

                         {/* Controls Grid */}
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                           <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] uppercase text-gray-400 font-bold tracking-widest">{t.skinTexture}</label>
                                <button 
                                  onClick={() => setSkinTexture(!skinTexture)}
                                  className={`w-12 h-6 rounded-full transition-all relative shadow-inner ${skinTexture ? 'bg-gradient-to-r from-blue-500 to-indigo-500' : 'bg-gray-700'}`}
                                >
                                   <div className={`w-4 h-4 bg-white rounded-full absolute top-1 shadow-md transition-all ${skinTexture ? 'left-7' : 'left-1'}`}></div>
                                </button>
                              </div>
                           </div>
                           
                           <div className="space-y-3">
                              <label className="flex justify-between text-[10px] uppercase text-gray-400 font-bold tracking-widest">
                                {t.faceDetail}
                                <span className="text-blue-400">{faceDetail}%</span>
                              </label>
                              <div className="relative h-2 bg-gray-700 rounded-full">
                                <input 
                                  type="range" 
                                  min="0" 
                                  max="100" 
                                  value={faceDetail} 
                                  onChange={(e) => setFaceDetail(parseInt(e.target.value))}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                />
                                <div className="absolute top-0 left-0 h-full bg-blue-500 rounded-full pointer-events-none" style={{ width: `${faceDetail}%` }}></div>
                                <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-[0_0_10px_rgba(59,130,246,0.8)] pointer-events-none transition-all" style={{ left: `calc(${faceDetail}% - 8px)` }}></div>
                              </div>
                           </div>
                         </div>

                         <div className="space-y-3">
                            <label className="text-[10px] uppercase text-gray-400 font-bold tracking-widest">{t.lightingIntensity}</label>
                            <div className="grid grid-cols-4 gap-2">
                              {(['soft', 'cinematic', 'dramatic', 'intense'] as LightingIntensity[]).map((mode) => (
                                 <button
                                   key={mode}
                                   onClick={() => setLighting(mode)}
                                   className={`
                                     py-2 px-1 text-[9px] font-bold rounded-lg border transition-all uppercase tracking-wide
                                     ${lighting === mode 
                                       ? 'bg-yellow-500/10 border-yellow-500 text-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.2)]' 
                                       : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10 hover:text-gray-200'}
                                   `}
                                 >
                                    {mode === 'soft' && t.lightSoft}
                                    {mode === 'cinematic' && t.lightCinematic}
                                    {mode === 'dramatic' && t.lightDramatic}
                                    {mode === 'intense' && t.lightIntense}
                                 </button>
                              ))}
                            </div>
                         </div>

                         <div className="space-y-3">
                            <label className="text-[10px] uppercase text-gray-400 font-bold tracking-widest">{t.colorGrading}</label>
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mask-fade-sides">
                               {(['none', 'warm_vintage', 'cool_noir', 'teal_orange', 'classic_bw'] as ColorGradingStyle[]).map((style) => (
                                 <button
                                   key={style}
                                   onClick={() => setColorGrading(style)}
                                   className={`
                                     shrink-0 px-4 py-1.5 text-[10px] font-bold rounded-full border transition-all whitespace-nowrap uppercase tracking-wider
                                     ${colorGrading === style 
                                       ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-transparent shadow-lg' 
                                       : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}
                                   `}
                                 >
                                    {style === 'none' && t.gradeNone}
                                    {style === 'warm_vintage' && t.gradeVintage}
                                    {style === 'cool_noir' && t.gradeNoir}
                                    {style === 'teal_orange' && t.gradeTealOrange}
                                    {style === 'classic_bw' && t.gradeBW}
                                 </button>
                               ))}
                            </div>
                         </div>

                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] uppercase text-gray-400 font-bold tracking-widest">{t.backgroundStyle}</label>
                              {backgroundConfig.type === 'custom_color' && (
                                 <span className="text-[10px] text-gray-400 font-mono">{backgroundConfig.value}</span>
                              )}
                            </div>
                            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide p-1">
                              {BACKGROUND_PRESETS.map((preset) => (
                                <button
                                  key={preset.id}
                                  onClick={() => setBackgroundConfig({ type: 'preset', value: preset.id })}
                                  className={`group relative shrink-0 w-10 h-10 rounded-full border-2 transition-all duration-300 ${backgroundConfig.type === 'preset' && backgroundConfig.value === preset.id ? 'border-white scale-110 shadow-[0_0_15px_rgba(255,255,255,0.4)]' : 'border-transparent opacity-70 hover:opacity-100 hover:scale-105'}`}
                                  title={t[preset.labelKey] || preset.labelKey}
                                  style={{ background: preset.color }}
                                >
                                   {backgroundConfig.type === 'preset' && backgroundConfig.value === preset.id && (
                                     <div className="absolute inset-0 flex items-center justify-center">
                                       <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white drop-shadow-md">
                                         <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" />
                                       </svg>
                                     </div>
                                   )}
                                </button>
                              ))}
                              
                              <div className="relative shrink-0 w-10 h-10 rounded-full border-2 border-dashed border-gray-500 flex items-center justify-center overflow-hidden hover:border-gray-300 transition-colors bg-white/5">
                                 <input 
                                   type="color" 
                                   className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                   onChange={(e) => setBackgroundConfig({ type: 'custom_color', value: e.target.value })}
                                   value={backgroundConfig.type === 'custom_color' ? backgroundConfig.value : '#000000'}
                                   title={t.customColor}
                                 />
                                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-gray-400 pointer-events-none">
                                   <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.85 6.361a15.996 15.996 0 00-4.647 4.763m0 0a3.001 3.001 0 00-2.25 2.25m3.24-3.375a3 3 0 00-1.425-1.425" />
                                 </svg>
                              </div>
                            </div>
                          </div>
                       </div>
                     )}
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                       <label className="text-[10px] uppercase text-gray-400 font-bold tracking-widest">{t.suggestions}</label>
                       <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mask-fade-sides">
                         {PROMPT_SUGGESTIONS.map(s => (
                           <button
                             key={s.id}
                             onClick={() => setPrompt(s.prompt)}
                             className={`shrink-0 px-4 py-2 rounded-xl text-[10px] font-bold text-white bg-gradient-to-br ${s.color} hover:contrast-125 transition-all shadow-md active:scale-95 border border-white/10`}
                           >
                             {t[s.labelKey] || s.labelKey}
                           </button>
                         ))}
                       </div>
                    </div>

                    <div className="relative group/prompt">
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        className="w-full h-32 p-4 rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-black/40 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 resize-none text-sm dark:text-gray-200 placeholder-gray-400 transition-all shadow-inner"
                        placeholder="Describe your desired portrait style..."
                      />
                      
                      <div className="absolute bottom-3 right-3 opacity-0 group-hover/prompt:opacity-100 transition-opacity">
                         <button 
                          onClick={() => setPrompt(DEFAULT_PROMPT)}
                          className="text-[10px] text-blue-400 hover:text-white font-bold uppercase tracking-wider bg-blue-500/10 hover:bg-blue-500 px-2 py-1 rounded transition-colors"
                         >
                          {t.resetPrompt}
                         </button>
                      </div>
                    </div>
                  </div>

                  <Button 
                    onClick={handleGenerate}
                    isLoading={status.isLoading}
                    disabled={!selectedImage}
                    className="w-full mt-6 text-lg py-4 rounded-xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 bg-[length:200%_auto] hover:bg-[100%] transition-all duration-500 shadow-[0_0_30px_rgba(37,99,235,0.4)] transform hover:-translate-y-0.5"
                  >
                    {status.isLoading ? (isAnimating ? t.animating : t[LOADING_MESSAGES[loadingMessageIndex]] || t.processing) : t.generate}
                  </Button>
              </div>

              {status.error && (
                <div className="p-4 bg-red-500/10 text-red-400 rounded-2xl border border-red-500/20 text-sm animate-fadeIn flex items-center gap-3 shadow-lg backdrop-blur-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 shrink-0">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {status.error}
                </div>
              )}
            </section>

            {/* RIGHT PANEL: Studio Viewport */}
            <section className="lg:col-span-8 flex flex-col h-full gap-6 sticky top-24 animate-slideUp" style={{ animationDelay: '0.2s' }}>
              
              <div className="bg-white/80 dark:bg-[#13151a]/80 backdrop-blur-xl rounded-[2.5rem] p-3 border border-gray-200 dark:border-white/10 shadow-2xl flex flex-col h-[750px] relative overflow-hidden">
                  
                {/* Screen Glare Effect */}
                <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-bl from-white/5 to-transparent pointer-events-none rounded-[2.5rem] z-20"></div>

                {/* Studio Viewport */}
                <div className="flex-1 rounded-[2rem] bg-gray-100 dark:bg-[#08090c] border border-gray-300 dark:border-white/5 flex flex-col items-center justify-center relative overflow-hidden group/viewport shadow-inner">
                    
                    {/* Grid Pattern */}
                    <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

                    {resultImage ? (
                      <div className="w-full h-full flex flex-col relative z-10">
                        {/* Floating Tabs */}
                        {videoResult && (
                          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 flex bg-black/60 backdrop-blur-xl p-1.5 rounded-full border border-white/10 shadow-lg">
                             <button 
                               onClick={() => setActiveTab('image')}
                               className={`px-6 py-2 rounded-full text-xs font-bold transition-all ${activeTab === 'image' ? 'bg-white text-black shadow-md' : 'text-gray-300 hover:text-white'}`}
                             >
                               {t.viewImage}
                             </button>
                             <button 
                               onClick={() => setActiveTab('video')}
                               className={`px-6 py-2 rounded-full text-xs font-bold transition-all ${activeTab === 'video' ? 'bg-white text-black shadow-md' : 'text-gray-300 hover:text-white'}`}
                             >
                               {t.viewVideo}
                             </button>
                          </div>
                        )}

                        <div className="flex-1 flex items-center justify-center overflow-hidden p-10">
                          {activeTab === 'image' ? (
                             <img 
                              src={resultImage} 
                              alt="Generated Portrait" 
                              className="max-h-full max-w-full object-contain animate-zoomIn shadow-2xl rounded-lg hover:scale-[1.01] transition-transform duration-700 hover:shadow-blue-500/20"
                             />
                          ) : (
                             <video 
                               src={videoResult!} 
                               controls 
                               loop
                               autoPlay
                               muted
                               playsInline
                               className="max-h-full max-w-full object-contain animate-fadeIn rounded-lg shadow-2xl"
                             />
                          )}
                        </div>
                        
                        {/* Action Bar Floating Bottom */}
                        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4 z-30">
                           <Button onClick={handleDownload} className="bg-white text-black hover:bg-gray-100 shadow-[0_0_20px_rgba(255,255,255,0.3)] border-none py-2.5 px-8 rounded-full text-sm font-bold tracking-wide">
                             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 mr-2">
                               <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 12.75l-6-6M12 12.75l6-6M12 12.75V3" />
                             </svg>
                             {activeTab === 'video' ? t.downloadVideo : t.download}
                           </Button>
                           
                           {!videoResult && (
                             <Button onClick={handleAnimate} className="bg-black/60 backdrop-blur-xl text-white hover:bg-black/80 border border-white/20 py-2.5 px-8 rounded-full text-sm font-bold tracking-wide hover:shadow-[0_0_20px_rgba(59,130,246,0.3)]" isLoading={isAnimating}>
                               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 mr-2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                               </svg>
                               {t.animate}
                             </Button>
                           )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center p-8 opacity-40 select-none">
                         {status.isLoading ? (
                           <div className="flex flex-col items-center gap-6">
                             <div className="relative">
                               <div className="w-24 h-24 border-[3px] border-blue-500/20 rounded-full animate-spin"></div>
                               <div className="absolute top-0 left-0 w-24 h-24 border-[3px] border-t-blue-500 rounded-full animate-spin"></div>
                               <div className="absolute inset-0 flex items-center justify-center">
                                 <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                               </div>
                             </div>
                             <p className="text-sm font-bold tracking-[0.2em] uppercase animate-pulse text-blue-400">{t.refining}</p>
                           </div>
                         ) : (
                           <div className="flex flex-col items-center gap-6">
                              <div className="w-32 h-32 rounded-full bg-white/5 flex items-center justify-center border border-white/10 shadow-inner">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={0.8} stroke="currentColor" className="w-12 h-12 text-gray-500">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                </svg>
                              </div>
                              <p className="text-lg font-medium text-gray-500 tracking-wide">{t.noResult}</p>
                           </div>
                         )}
                      </div>
                    )}
                </div>
                
                {/* Chat Panel Integrated */}
                {resultImage && (
                  <div className="border-t border-gray-200 dark:border-white/5 pt-2">
                     <ChatInterface 
                        messages={chatMessages}
                        onSendMessage={handleChatEdit}
                        isLoading={status.isLoading}
                        language={language}
                        disabled={!resultImage || isAnimating}
                      />
                  </div>
                )}
              </div>
              
              <div className="text-center mt-2">
                 <p className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.2em] opacity-40 flex items-center justify-center gap-4">
                   <span className="w-12 h-px bg-gradient-to-r from-transparent via-gray-500 to-transparent"></span>
                   {t.poweredBy}
                   <span className="w-12 h-px bg-gradient-to-r from-transparent via-gray-500 to-transparent"></span>
                 </p>
              </div>
            </section>
          </div>

          {/* History Section - Horizontal Reel Style */}
          {history.length > 0 && (
            <section className="bg-white/80 dark:bg-[#13151a]/60 backdrop-blur-md rounded-[2rem] p-8 border border-gray-200 dark:border-white/5 shadow-xl mb-12 animate-slideUp" style={{ animationDelay: '0.3s' }}>
               <div className="flex items-center justify-between mb-8">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-3">
                     <div className="p-2 bg-blue-500/10 rounded-lg">
                       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-blue-500">
                         <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                       </svg>
                     </div>
                     {t.history} 
                     <span className="text-xs font-bold text-gray-500 bg-gray-100 dark:bg-white/5 px-3 py-1 rounded-full border border-white/5">{history.length}</span>
                  </h3>
                  <button 
                    onClick={handleClearHistory}
                    className="text-xs font-bold text-red-500 hover:text-red-400 bg-red-500/5 hover:bg-red-500/10 px-4 py-2 rounded-full transition-colors border border-red-500/10"
                  >
                     {t.clearHistory}
                  </button>
               </div>
               
               <div className="flex gap-4 overflow-x-auto pb-6 scrollbar-hide snap-x mask-fade-sides">
                 {history.map((item, index) => (
                   <div 
                     key={item.id} 
                     onClick={() => restoreHistoryItem(item)}
                     className="snap-start shrink-0 group relative w-40 h-40 rounded-2xl overflow-hidden cursor-pointer border border-gray-200 dark:border-white/10 shadow-sm hover:shadow-2xl hover:shadow-blue-500/20 transition-all duration-300 hover:scale-105 hover:-translate-y-2 animate-fadeIn"
                     style={{ animationDelay: `${index * 0.05}s` }}
                     title={item.prompt}
                   >
                      <img 
                        src={item.imageUrl} 
                        alt="History" 
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 grayscale group-hover:grayscale-0"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
                         <span className="text-white text-[10px] font-bold uppercase tracking-wider mb-1">
                           {t.view}
                         </span>
                      </div>
                      <button
                        onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                        className="absolute top-2 right-2 bg-red-500/80 hover:bg-red-600 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100 backdrop-blur-md"
                        title={t.delete}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                        </svg>
                      </button>
                   </div>
                 ))}
               </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
