
import React, { useState, useEffect } from 'react';
import { AppStep, Product, ProcessedSite, AppSettings, DEFAULT_SETTINGS, GroundingSource } from './types';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import StepInput from './components/StepInput';
import StepScanning from './components/StepScanning';
import StepResults from './components/StepResults';
import StepImporting from './components/StepImporting';
import StepSuccess from './components/StepSuccess';
import StepHistory from './components/StepHistory';
import Settings from './components/Settings';
import StepStockUpdate from './components/StepStockUpdate';
import StepJsonViewer from './components/StepJsonViewer';
import StepOrderGeneration from './components/StepOrderGeneration';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<AppStep>(AppStep.INPUT);
  const [targetUrl, setTargetUrl] = useState('');
  const [targetLimit, setTargetLimit] = useState(10);
  const [products, setProducts] = useState<Product[]>([]);
  const [groundingSources, setGroundingSources] = useState<GroundingSource[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedProductsForJson, setSelectedProductsForJson] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ProcessedSite[]>([]);
  const [isViewingHistory, setIsViewingHistory] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const savedHistory = localStorage.getItem('onestock_import_history');
    if (savedHistory) {
      try { setHistory(JSON.parse(savedHistory)); } catch (e) { console.error(e); }
    }

    const savedSettings = localStorage.getItem('onestock_app_settings');
    if (savedSettings) {
      try { setSettings(JSON.parse(savedSettings)); } catch (e) { console.error(e); }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('onestock_import_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('onestock_app_settings', JSON.stringify(settings));
  }, [settings]);

  const handleStartScan = (url: string, limit: number) => {
    setTargetUrl(url);
    setTargetLimit(limit);
    setIsViewingHistory(false);
    setError(null);
    setCurrentStep(AppStep.SCANNING);
  };

  const handleScanComplete = (results: Product[], sources: GroundingSource[]) => {
    setProducts(results);
    setGroundingSources(sources);
    setSelectedIds(new Set(results.map(p => p.id)));
    setCurrentStep(AppStep.RESULTS);
  };

  const handleUpdateProduct = (updatedProduct: Product) => {
    setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
  };

  const handleAddProduct = (newProduct: Product) => {
    setProducts(prev => [newProduct, ...prev]);
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.add(newProduct.id);
      return next;
    });
  };

  const handleDeleteProduct = (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleStartImport = () => {
    setCurrentStep(AppStep.IMPORTING);
  };

  const handleImportComplete = () => {
    const newSite: ProcessedSite = {
      id: Date.now().toString(),
      url: targetUrl,
      hostname: new URL(targetUrl).hostname,
      date: new Date().toLocaleString(),
      products: products,
      sources: groundingSources
    };
    setHistory(prev => [newSite, ...prev]);
    setCurrentStep(AppStep.SUCCESS);
  };

  const handleGenerateJson = (selected: Product[]) => {
    setSelectedProductsForJson(selected);
    setCurrentStep(AppStep.JSON_VIEWER);
  };

  const handleImportJson = (site: ProcessedSite) => {
    if (site && site.id && site.products && Array.isArray(site.products)) {
      setHistory(prev => {
        if (prev.some(item => item.id === site.id)) return prev;
        return [site, ...prev];
      });
    } else {
      console.error('Invalid JSON format.');
    }
  };

  const handleViewHistoryItem = (site: ProcessedSite) => {
    setTargetUrl(site.url);
    setProducts(site.products);
    setGroundingSources(site.sources || []);
    setSelectedIds(new Set(site.products.map(p => p.id)));
    setIsViewingHistory(true);
    setCurrentStep(AppStep.RESULTS);
  };

  const reset = () => {
    setTargetUrl('');
    setProducts([]);
    setGroundingSources([]);
    setSelectedIds(new Set());
    setIsViewingHistory(false);
    setCurrentStep(AppStep.INPUT);
    setError(null);
  };

  const goToInput = () => {
    setTargetUrl('');
    setProducts([]);
    setGroundingSources([]);
    setSelectedIds(new Set());
    setIsViewingHistory(false);
    setCurrentStep(AppStep.INPUT);
  };

  // Only pass items that are currently selected in Step 2 to sub-tools
  const selectedProducts = products.filter(p => selectedIds.has(p.id));

  return (
    <div className="flex h-screen overflow-hidden text-gray-800 bg-[#F8FAFC]">
      <Sidebar 
        currentStep={currentStep} 
        onReset={reset} 
        onGoToHistory={() => setCurrentStep(AppStep.HISTORY)}
        onNewImport={goToInput}
        onGoToSettings={() => setCurrentStep(AppStep.SETTINGS)}
        onGoToStock={() => setCurrentStep(AppStep.STOCK_UPDATE)}
        onGoToOrders={() => setCurrentStep(AppStep.ORDER_GENERATION)}
        onGoToResults={() => setCurrentStep(AppStep.RESULTS)}
        hasProducts={products.length > 0}
      />
      
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        
        <main className="flex-1 overflow-y-auto p-6 lg:p-10">
          <div className="max-w-6xl mx-auto h-full">
            {currentStep === AppStep.SETTINGS && (
              <Settings settings={settings} onSave={setSettings} />
            )}

            {currentStep === AppStep.STOCK_UPDATE && (
              <StepStockUpdate 
                products={selectedProducts} 
                settings={settings} 
                onCancel={() => setCurrentStep(AppStep.RESULTS)}
              />
            )}

            {currentStep === AppStep.ORDER_GENERATION && (
              <StepOrderGeneration 
                products={selectedProducts} 
                settings={settings} 
                onCancel={() => setCurrentStep(AppStep.RESULTS)}
              />
            )}

            {currentStep === AppStep.HISTORY && (
              <StepHistory 
                history={history} 
                onViewItem={handleViewHistoryItem} 
                onNewImport={goToInput}
                settings={settings}
                onImportJson={handleImportJson}
              />
            )}

            {currentStep === AppStep.INPUT && (
              <StepInput onStart={handleStartScan} />
            )}
            
            {currentStep === AppStep.SCANNING && (
              <StepScanning 
                url={targetUrl} 
                limit={targetLimit}
                onComplete={handleScanComplete} 
                onError={(msg) => { setError(msg); setCurrentStep(AppStep.INPUT); }} 
              />
            )}
            
            {currentStep === AppStep.RESULTS && (
              <StepResults 
                products={products} 
                url={targetUrl} 
                settings={settings}
                sources={groundingSources}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                onImport={handleStartImport}
                onCancel={reset}
                onGenerateJson={handleGenerateJson}
                isHistoryView={isViewingHistory}
                onUpdateProduct={handleUpdateProduct}
                onAddProduct={handleAddProduct}
                onDeleteProduct={handleDeleteProduct}
              />
            )}

            {currentStep === AppStep.JSON_VIEWER && (
              <StepJsonViewer 
                selectedProducts={selectedProductsForJson}
                settings={settings}
                onBack={() => setCurrentStep(AppStep.RESULTS)}
              />
            )}
            
            {currentStep === AppStep.IMPORTING && (
              <StepImporting 
                products={selectedProducts} 
                url={targetUrl} 
                onComplete={handleImportComplete} 
              />
            )}
            
            {currentStep === AppStep.SUCCESS && (
              <StepSuccess onReset={() => setCurrentStep(AppStep.INPUT)} url={targetUrl} />
            )}
            
            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex flex-col gap-1 animate-in slide-in-from-top-2">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span className="text-sm font-bold">Extraction Error</span>
                </div>
                <p className="text-xs ml-8 opacity-80">{error}</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
