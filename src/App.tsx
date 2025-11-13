import { useEffect, useState } from 'react';
import { OpticalDesignApp } from './components/OpticalDesignApp';
import { GlassCatalog } from './optical/materials/GlassCatalog';
import './styles/optical-theme.css';

function App() {
  const [catalogsLoaded, setCatalogsLoaded] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    // Load glass catalogs once on app startup
    GlassCatalog.initialize()
      .then(() => {
        setCatalogsLoaded(true);
        
        // Make test function available in browser console for debugging
        (window as any).testMaterials = () => GlassCatalog.testMaterialLookup();
        (window as any).GlassCatalog = GlassCatalog;
        (window as any).forceReloadCatalog = () => GlassCatalog.forceReload();
        console.log('🧪 Debug functions available in console: testMaterials(), GlassCatalog, forceReloadCatalog()');
      })
      .catch((error) => {
        console.warn('⚠️  Running without glass catalogs:', error);
        setCatalogError(error.message);
        setCatalogsLoaded(true); // Continue anyway
      });
  }, []);

  if (!catalogsLoaded) {
    return (
      <div className="loading-container" style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#1a1a1a',
        color: '#ffffff',
        fontFamily: 'system-ui, sans-serif'
      }}>
        <div>
          <div style={{ marginBottom: '10px' }}>🔬 Loading glass catalogs...</div>
          <div style={{ fontSize: '14px', opacity: 0.7 }}>Schott and Ohara optical glass databases</div>
        </div>
      </div>
    );
  }

  return (
    <>
      {catalogError && (
        <div style={{
          position: 'fixed',
          top: '10px',
          right: '10px',
          backgroundColor: '#ff6b35',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          zIndex: 1000,
          maxWidth: '300px'
        }}>
          ⚠️ Glass catalogs unavailable - using manual n1/n2 only
        </div>
      )}
      <OpticalDesignApp />
    </>
  );
}

export default App
