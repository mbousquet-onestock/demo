
import React, { useState, useEffect } from 'react';
import { AppStep, Product, ProcessedSite, GroundingSource } from './types';
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
import StepApiExplorer from './components/StepApiExplorer';
import StepApiLog from './components/StepApiLog';
import StepStockPoints from './components/StepStockPoints';
import StepManualSteps from './components/StepManualSteps';
import { historyStore, settingsStore } from './services/appStores';
import { initDbSync, migrateLegacyLocalConnections } from './services/dbSync';
import { onestockItemsToProducts } from './utils/payloadUtils';
import { setLastProject } from './services/payloadStore';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<AppStep>(AppStep.HISTORY);
  const [targetUrl, setTargetUrl] = useState('');
  const [targetLimit, setTargetLimit] = useState(10);
  const [products, setProducts] = useState<Product[]>([]);
  const [groundingSources, setGroundingSources] = useState<GroundingSource[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedProductsForJson, setSelectedProductsForJson] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isViewingHistory, setIsViewingHistory] = useState(false);
  // Saved payload / project the Product Manager list was loaded from.
  const [productSource, setProductSource] = useState<{ label: string; project?: string } | null>(null);
  // History and settings live in stores cached in localStorage and synced to the Vercel database.
  const history = historyStore.use();
  const setHistory = historyStore.set;
  const settings = settingsStore.use();
  const setSettings = settingsStore.set;

  useEffect(() => {
    migrateLegacyLocalConnections();
    initDbSync();
  }, []);

  const handleStartScan = (url: string, limit: number) => {
    setTargetUrl(url);
    setTargetLimit(limit);
    setIsViewingHistory(false);
    setError(null);
    setCurrentStep(AppStep.SCANNING);
  };

  const handleScanComplete = (results: Product[], sources: GroundingSource[]) => {
    setProductSource(null);
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

  // Loads OneStock items (saved GET /items result or /items payload) into the Product Manager.
  const handleOpenItems = (items: any[], label: string, mode?: 'replace' | 'append', project?: string) => {
    const loaded = onestockItemsToProducts(items, settings.salesChannel);
    const effectiveMode = mode || (products.length === 0 || window.confirm(
      `Replace the ${products.length} product(s) currently in the Product Manager with "${label}"?\n(Cancel = add them to the current list)`
    ) ? 'replace' : 'append');
    // The next payload save defaults to the project the items come from.
    if (project) setLastProject(project);
    setProductSource(prev => (effectiveMode === 'replace' || !prev ? { label, project } : { label: `${prev.label} + ${label}`, project: project || prev.project }));
    if (effectiveMode === 'replace') {
      setProducts(loaded);
      setSelectedIds(new Set(loaded.map(p => p.id)));
      setTargetUrl('');
      setGroundingSources([]);
    } else {
      setProducts(prev => [...loaded, ...prev]);
      setSelectedIds(prev => new Set([...prev, ...loaded.map(p => p.id)]));
    }
    setIsViewingHistory(false);
    setError(null);
    setCurrentStep(AppStep.RESULTS);
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
    setProductSource(null);
    setTargetUrl(site.url);
    setProducts(site.products);
    setGroundingSources(site.sources || []);
    setSelectedIds(new Set(site.products.map(p => p.id)));
    setIsViewingHistory(true);
    setCurrentStep(AppStep.RESULTS);
  };

  const reset = () => {
    setProductSource(null);
    setTargetUrl('');
    setProducts([]);
    setGroundingSources([]);
    setSelectedIds(new Set());
    setIsViewingHistory(false);
    setCurrentStep(AppStep.HISTORY);
    setError(null);
  };

  const goToInput = () => {
    setProductSource(null);
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
        onNavigate={setCurrentStep}
      />
      
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        
        <main className="flex-1 overflow-y-auto p-6 lg:p-10">
          <div className="max-w-6xl mx-auto h-full">
            {currentStep === AppStep.API_EXPLORER && <StepApiExplorer onOpenItems={(items, label) => handleOpenItems(items, label)} />}

            {currentStep === AppStep.API_LOG && <StepApiLog />}

            {currentStep === AppStep.STOCK_POINTS && <StepStockPoints />}

            {currentStep === AppStep.MANUAL_STEPS && <StepManualSteps />}

            {currentStep === AppStep.SETTINGS && (
              <Settings settings={settings} onSave={setSettings} />
            )}

            {currentStep === AppStep.STOCK_UPDATE && (
              <StepStockUpdate 
                products={selectedProducts} 
                settings={settings} 
                onEndpointsChange={ids => setSettings(prev => ({ ...prev, stockEndpoints: ids }))}
                onCancel={() => setCurrentStep(AppStep.RESULTS)}
              />
            )}

            {currentStep === AppStep.ORDER_GENERATION && (
              <StepOrderGeneration 
                products={selectedProducts} 
                settings={settings} 
                onUpdateSettings={patch => setSettings(prev => ({ ...prev, ...patch }))}
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
                onCancel={reset}
                onGenerateJson={handleGenerateJson}
                isHistoryView={isViewingHistory}
                onUpdateProduct={handleUpdateProduct}
                onAddProduct={handleAddProduct}
                onDeleteProduct={handleDeleteProduct}
                onOpenItems={handleOpenItems}
                source={productSource}
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
              <StepSuccess onReset={() => setCurrentStep(AppStep.HISTORY)} url={targetUrl} />
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
