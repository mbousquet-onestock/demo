
import React, { useState, useEffect } from 'react';
import { AppStep, Product } from './types';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import StepResults from './components/StepResults';
import Settings from './components/Settings';
import StepStockUpdate from './components/StepStockUpdate';
import StepOrderGeneration from './components/StepOrderGeneration';
import StepApiExplorer from './components/StepApiExplorer';
import StepApiLog from './components/StepApiLog';
import StepStockPoints from './components/StepStockPoints';
import StepManualSteps from './components/StepManualSteps';
import StepProjects from './components/StepProjects';
import StepDeliveryRoutes from './components/StepDeliveryRoutes';
import { settingsStore } from './services/appStores';
import { initDbSync, migrateLegacyLocalConnections } from './services/dbSync';
import { onestockItemsToProducts } from './utils/payloadUtils';
import { setLastProject } from './services/payloadStore';
import { initCaptureListener } from './services/captureService';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<AppStep>(AppStep.PROJECTS);
  const [targetUrl, setTargetUrl] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  // Saved payload / project the Product Manager list was loaded from.
  const [productSource, setProductSource] = useState<{ label: string; project?: string } | null>(null);
  // Settings live in a store cached in localStorage and synced to the Vercel database.
  const settings = settingsStore.use();
  const setSettings = settingsStore.set;

  useEffect(() => {
    migrateLegacyLocalConnections();
    // Products sent by the capture bookmarklet open the Product Manager.
    const stopCapture = initCaptureListener(() => setCurrentStep(AppStep.RESULTS));
    // Local cache of the removed Import History (the database copy is left untouched).
    try { localStorage.removeItem('onestock_import_history'); } catch { /* ignore */ }
    initDbSync();
    return stopCapture;
  }, []);

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

  // Loads products into the Product Manager (replace or append to the current list).
  const handleLoadProducts = (loaded: Product[], label: string, mode?: 'replace' | 'append', project?: string) => {
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
    } else {
      setProducts(prev => [...loaded, ...prev]);
      setSelectedIds(prev => new Set([...prev, ...loaded.map(p => p.id)]));
    }
    setError(null);
    setCurrentStep(AppStep.RESULTS);
  };

  // Loads OneStock items (saved GET /items result or /items payload) into the Product Manager.
  const handleOpenItems = (items: any[], label: string, mode?: 'replace' | 'append', project?: string) =>
    handleLoadProducts(onestockItemsToProducts(items, settings.salesChannel), label, mode, project);

  const reset = () => {
    setProductSource(null);
    setTargetUrl('');
    setProducts([]);
    setSelectedIds(new Set());
    setCurrentStep(AppStep.PROJECTS);
    setError(null);
  };

  // Only pass items that are currently selected in Step 2 to sub-tools
  const selectedProducts = products.filter(p => selectedIds.has(p.id));

  return (
    <div className="flex h-screen overflow-hidden text-gray-800 bg-[#F8FAFC]">
      <Sidebar 
        currentStep={currentStep} 
        onReset={reset} 
        onGoToSettings={() => setCurrentStep(AppStep.SETTINGS)}
        onGoToStock={() => setCurrentStep(AppStep.STOCK_UPDATE)}
        onGoToOrders={() => setCurrentStep(AppStep.ORDER_GENERATION)}
        onGoToResults={() => setCurrentStep(AppStep.RESULTS)}
        onNavigate={setCurrentStep}
      />
      
      <div className="flex-1 flex flex-col min-w-0">
        <Header settings={settings} onChange={patch => setSettings(prev => ({ ...prev, ...patch }))} onManage={() => setCurrentStep(AppStep.SETTINGS)} />
        
        <main className="flex-1 overflow-y-auto p-6 lg:p-10">
          <div className="max-w-6xl mx-auto h-full">
            {currentStep === AppStep.API_EXPLORER && <StepApiExplorer onOpenItems={(items, label) => handleOpenItems(items, label)} />}

            {currentStep === AppStep.API_LOG && <StepApiLog />}

            {currentStep === AppStep.STOCK_POINTS && <StepStockPoints />}

            {currentStep === AppStep.MANUAL_STEPS && <StepManualSteps />}

            {currentStep === AppStep.PROJECTS && <StepProjects />}

            {currentStep === AppStep.DELIVERY_ROUTES && <StepDeliveryRoutes />}

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

            {currentStep === AppStep.RESULTS && (
              <StepResults 
                products={products} 
                url={targetUrl} 
                settings={settings}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                onCancel={reset}
                onUpdateProduct={handleUpdateProduct}
                onAddProduct={handleAddProduct}
                onDeleteProduct={handleDeleteProduct}
                onOpenItems={handleOpenItems}
                onLoadProducts={handleLoadProducts}
                source={productSource}
              />
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
