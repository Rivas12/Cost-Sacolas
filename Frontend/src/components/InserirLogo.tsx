import React, { useEffect, useMemo, useRef, useState } from 'react';
import './InserirLogo.css';

type LogoLayer = {
  id: string;
  name: string;
  img: HTMLImageElement;
  x: number;
  y: number;
  scale: number;
};

type BaseOption = {
  name: string;
  url: string | null;
  path?: string;
};

const TARGET_SQUARE_SIZE = 1000;

function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `logo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function InserirLogo() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);
  const [baseOptions, setBaseOptions] = useState<BaseOption[]>([]);
  const [folderOptions, setFolderOptions] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [loadingFolders, setLoadingFolders] = useState<boolean>(false);
  const [baseSource, setBaseSource] = useState<string>('');
  const [loadingBase, setLoadingBase] = useState<boolean>(false);
  const [logos, setLogos] = useState<LogoLayer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hint, setHint] = useState<string>('Faça upload da logo, depois arraste no canvas para posicionar.');
  const dragState = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);

  const baseChoices = useMemo(() => baseOptions, [baseOptions]);

  const normalizeImageToSquare = (img: HTMLImageElement, targetSize = TARGET_SQUARE_SIZE) =>
    new Promise<HTMLImageElement>((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = targetSize;
      canvas.height = targetSize;
      if (!ctx) {
        resolve(img);
        return;
      }

      ctx.clearRect(0, 0, targetSize, targetSize);
      const scale = Math.min(targetSize / img.width, targetSize / img.height);
      const drawWidth = img.width * scale;
      const drawHeight = img.height * scale;
      const offsetX = (targetSize - drawWidth) / 2;
      const offsetY = (targetSize - drawHeight) / 2;
      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

      const normalized = new Image();
      normalized.onload = () => resolve(normalized);
      normalized.src = canvas.toDataURL('image/png');
    });

  const loadBaseFromSrc = (src: string | null | undefined) => {
    if (!src) {
      setBaseImage(null);
      return;
    }
    setLoadingBase(true);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    img.onload = () => {
      setBaseImage(img);
      setLoadingBase(false);
    };
    img.onerror = () => {
      setHint('Não foi possível carregar a base selecionada.');
      setLoadingBase(false);
    };
  };

  // Lista pastas (opiniões) no bucket e carrega as imagens da primeira pasta
  useEffect(() => {
    const fetchFolders = async () => {
      setLoadingFolders(true);
      try {
        const res = await fetch('/api/canvas/pastas');
        if (!res.ok) throw new Error('Erro ao buscar pastas');
        const data = await res.json();
        const folders: string[] = Array.isArray(data?.folders)
          ? data.folders.map((f: any) => (typeof f === 'string' ? f : f?.name)).filter(Boolean)
          : Array.isArray(data)
            ? data.filter((f) => typeof f === 'string')
            : [];

        if (folders.length) {
          setFolderOptions(folders);
          setSelectedFolder((prev) => prev || folders[0]);
          setHint('Escolha a pasta e depois a base.');
        } else {
          setFolderOptions([]);
          setHint('Nenhuma pasta encontrada no bucket.');
        }
      } catch (e) {
        console.error(e);
        setFolderOptions([]);
        setHint('Não foi possível carregar as pastas do bucket.');
      } finally {
        setLoadingFolders(false);
      }
    };
    fetchFolders();
  }, []);

  // Carrega imagens da pasta selecionada
  useEffect(() => {
    if (!selectedFolder) {
      setBaseOptions([]);
      setBaseImage(null);
      setBaseSource('');
      return;
    }

    const fetchBasesFromFolder = async () => {
      setLoadingBase(true);
      try {
        const res = await fetch(`/api/canvas/bases?folder=${encodeURIComponent(selectedFolder)}`);
        if (!res.ok) throw new Error('Erro ao buscar bases da pasta');
        const data = await res.json();
        const files = Array.isArray(data?.files) ? data.files : Array.isArray(data) ? data : [];

        if (files.length) {
          const mapped: BaseOption[] = files.map((file: any) => ({
            name: file?.name || file?.path || 'imagem',
            path: file?.path,
            url: file?.url ?? null,
          }));
          setBaseOptions(mapped);
          const firstWithUrl = mapped.find((f) => Boolean(f.url));
          if (firstWithUrl?.url) {
            setBaseSource(firstWithUrl.url);
            loadBaseFromSrc(firstWithUrl.url);
            setHint(`Base carregada da pasta ${selectedFolder}.`);
          } else {
            setBaseSource('');
            setBaseImage(null);
            setHint('Nenhuma imagem com URL disponível nesta pasta.');
          }
        } else {
          setBaseOptions([]);
          setBaseSource('');
          setBaseImage(null);
          setHint('Nenhuma imagem encontrada nesta pasta.');
        }
      } catch (e) {
        console.error(e);
        setBaseOptions([]);
        setBaseSource('');
        setBaseImage(null);
        setHint('Não foi possível carregar as bases da pasta.');
      } finally {
        setLoadingBase(false);
      }
    };

    fetchBasesFromFolder();
  }, [selectedFolder]);

  // Redesenha canvas sempre que algo muda
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !baseImage) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Ajusta tamanho do canvas à imagem base
    canvas.width = baseImage.width;
    canvas.height = baseImage.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baseImage, 0, 0, baseImage.width, baseImage.height);

    logos.forEach((logo) => {
      const drawWidth = logo.img.width * logo.scale;
      const drawHeight = logo.img.height * logo.scale;
      const drawX = logo.x - drawWidth / 2;
      const drawY = logo.y - drawHeight / 2;
      ctx.drawImage(logo.img, drawX, drawY, drawWidth, drawHeight);

      // borda leve para logo selecionada
      if (logo.id === selectedId) {
        ctx.save();
        ctx.strokeStyle = '#00bfff';
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX, drawY, drawWidth, drawHeight);
        ctx.restore();
      }
    });
  }, [baseImage, logos, selectedId]);

  const selectedLogo = useMemo(() => logos.find((l) => l.id === selectedId) || null, [logos, selectedId]);

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setHint('Envie apenas arquivos de imagem (png, jpg, svg).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onload = async () => {
        const normalizedImg = await normalizeImageToSquare(img);
        setLogos((prev) => {
          if (!baseImage) return prev; // espera carregar base
          const layer: LogoLayer = {
            id: makeId(),
            name: file.name,
            img: normalizedImg,
            scale: 1,
            x: baseImage.width / 2,
            y: baseImage.height / 2,
          };
          setSelectedId(layer.id);
          setHint('Clique no canvas para mover. Use o slider para redimensionar.');
          return [...prev, layer];
        });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (event.clientX - rect.left) * scaleX;
    const clickY = (event.clientY - rect.top) * scaleY;

    // Primeiro tenta selecionar a logo clicada (começando da última desenhada)
    const hit = [...logos].reverse().find((logo) => {
      const w = logo.img.width * logo.scale;
      const h = logo.img.height * logo.scale;
      const x = logo.x - w / 2;
      const y = logo.y - h / 2;
      return clickX >= x && clickX <= x + w && clickY >= y && clickY <= y + h;
    });

    if (hit) {
      setSelectedId(hit.id);
      return;
    }

    // Se já havia uma logo selecionada, move para o ponto clicado
    if (selectedId) {
      setLogos((prev) => prev.map((logo) => (logo.id === selectedId ? { ...logo, x: clickX, y: clickY } : logo)));
    }
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    const hit = [...logos].reverse().find((logo) => {
      const w = logo.img.width * logo.scale;
      const h = logo.img.height * logo.scale;
      const lx = logo.x - w / 2;
      const ly = logo.y - h / 2;
      return x >= lx && x <= lx + w && y >= ly && y <= ly + h;
    });

    if (hit) {
      setSelectedId(hit.id);
      dragState.current = { id: hit.id, offsetX: x - hit.x, offsetY: y - hit.y };
    } else {
      dragState.current = null;
    }
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragState.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    const { id, offsetX, offsetY } = dragState.current;
    setLogos((prev) => prev.map((logo) => (logo.id === id ? { ...logo, x: x - offsetX, y: y - offsetY } : logo)));
  };

  const handleMouseUp = () => {
    dragState.current = null;
  };

  const handleScaleChange = (value: number) => {
    if (!selectedId) return;
    setLogos((prev) => prev.map((logo) => (logo.id === selectedId ? { ...logo, scale: value } : logo)));
  };


  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mockup-logo.png';
    link.click();
  };

  const handleCopyToClipboard = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!navigator.clipboard || !window.ClipboardItem) {
      setHint('Clipboard API não disponível neste navegador.');
      return;
    }
    setHint('Copiando imagem para a área de transferência...');
    await new Promise<void>((resolve) => {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          setHint('Falha ao gerar a imagem.');
          return resolve();
        }
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ [blob.type]: blob })
          ]);
          setHint('Imagem copiada para a área de transferência!');
        } catch (err) {
          console.error(err);
          setHint('Não foi possível copiar. Tente salvar e abrir o arquivo.');
        }
        resolve();
      });
    });
  };

  return (
    <div className="inserir-logo">
      <section className="panel controls">
        <header className="panel-header">
          <h2>Inserir Logo</h2>
          <p>Monte um mockup rápido: carregue a logo, mova no canvas e baixe a prévia.</p>
        </header>

        <div className="control-group">
          <label className="input-label">Upload da logo</label>
          <input type="file" accept="image/*" onChange={handleLogoUpload} />
          <small className="muted">Formatos aceitos: png, jpg, svg. Tamanho ideal &lt; 2MB.</small>
        </div>

        {selectedLogo && (
          <div className="control-group">
            <label className="input-label">Tamanho</label>
            <div className="slider-row">
              <input
                type="range"
                min={0.2}
                max={2}
                step={0.05}
                value={Number(selectedLogo.scale.toFixed(2))}
                onChange={(e) => handleScaleChange(Number(e.target.value))}
              />
              <span className="slider-value">{Math.round(selectedLogo.scale * 100)}%</span>
            </div>
          </div>
        )}

        <div className="control-group">
          <label className="input-label">Pasta no Supabase</label>
          <select
            value={selectedFolder}
            onChange={(e) => setSelectedFolder(e.target.value)}
            disabled={loadingFolders || !folderOptions.length}
          >
            {!selectedFolder && <option value="">Selecione uma pasta</option>}
            {folderOptions.map((folder) => (
              <option key={folder} value={folder}>
                {folder}
              </option>
            ))}
          </select>
          <small className="muted">Escolha a pasta (opinião); em seguida selecione a base para carregar no canvas.</small>
        </div>

        <div className="control-group">
          <label className="input-label">Base do canvas (Supabase)</label>
          <div className="base-gallery">
            {baseChoices.filter((b) => Boolean(b.url)).map((b) => {
              const src = b.url as string;
              const isActive = baseSource === src;
              return (
                <button
                  key={b.name}
                  type="button"
                  className={`base-card ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    setBaseSource(src);
                    loadBaseFromSrc(src);
                  }}
                  disabled={!src || (loadingBase && isActive)}
                >
                  <div className="base-thumb">
                    <img src={src} alt={b.name} />
                  </div>
                  <span className="base-title">{b.name}</span>
                </button>
              );
            })}
            {(!baseChoices.length || !baseChoices.some((b) => b.url)) && (
              <div className="placeholder">Nenhuma base disponível.</div>
            )}
          </div>
          <small className="muted">As opções mostram a miniatura antes do título. Clique para trocar a base.</small>
        </div>

        {selectedLogo ? (
          <div className="control-group">
            <label className="input-label">Logo selecionada</label>
            <div className="selected-card">
              <div>
                <strong>{selectedLogo.name}</strong>
                <p className="muted">Clique e arraste no canvas para posicionar.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="control-group placeholder">Nenhuma logo selecionada.</div>
        )}
      </section>

      <section className="panel canvas-panel">
        <div className="canvas-head">
          <div>
            <h3>Canvas</h3>
            <p className="muted">Clique para selecionar/mover a logo. A imagem base já vem pré-carregada.</p>
          </div>
          <span className="badge">Pré-visualização</span>
        </div>
        <div className="canvas-area">
          <div className="canvas-wrapper">
            {!baseImage && <div className="canvas-loading">Carregando imagem base...</div>}
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
          </div>
          <div className="canvas-actions">
            <button className="primary" onClick={handleDownload} disabled={!baseImage}>
              Baixar
            </button>
            <button className="ghost" onClick={handleCopyToClipboard} disabled={!baseImage}>
              Copiar
            </button>
          </div>
        </div>
        <p className="muted hint">{hint}</p>
      </section>
    </div>
  );
}
