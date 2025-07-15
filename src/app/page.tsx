"use client";

import React from "react";
import { useState, useCallback } from "react";
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Transformer,
  Rect,
  Group,
  Text,
  Line,
} from "react-konva";
import Konva from "konva";

import { Button } from "@/components/ui/button";
import {
  Play,
  X,
  Copy,
  Settings,
  ArrowLeft,
  ChevronDown,
  Layers,
  Download,
  Crop,
  Check,
  Combine,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Upload,
  Scissors,
  Filter,
  Plus,
  ImageIcon,
  Trash2,
  Undo,
  Redo,
  Key,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Logo, SpinnerIcon } from "@/components/icons";
import { useTRPC } from "@/trpc/client";
import { useMutation } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { LoadingAnimation } from "@/components/ui/loading-animation";
import useImage from "use-image";
import { useRef, useEffect, useState as useStateReact } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { styleModels } from "@/lib/models";
import { useToast } from "@/hooks/use-toast";
import { cva, type VariantProps } from "class-variance-authority";
import { LogoIcon } from "@/components/icons/logo";

// Keyboard symbol mapping
const keySymbolMap: Record<string, string> = {
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  enter: "↵",
  esc: "esc",
  delete: "⌫",
  meta: "⌘",
  ctrl: "⌃",
  shift: "⇧",
};

// ShortcutBadge styling variants
const shortcutBadgeVariants = cva(
  [
    "flex items-center justify-center tracking-tighter",
    "rounded border px-1 font-mono",
  ],
  {
    variants: {
      variant: {
        default: "border-border",
        alpha: "bg-white/10 border-white/10",
      },
      size: {
        xs: "h-6 min-w-6 text-xs",
        sm: "h-7 min-w-7 text-sm",
        md: "h-8 min-w-8 text-md",
        lg: "h-9 min-w-9 text-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "sm",
    },
  }
);

type BaseShortcutBadgeProps = {
  shortcut: string;
};

interface ShortcutBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    BaseShortcutBadgeProps,
    VariantProps<typeof shortcutBadgeVariants> {}

function ShortcutBadge({
  className,
  variant,
  size,
  shortcut,
}: ShortcutBadgeProps) {
  const keys = shortcut
    .split("+")
    .map((key) => keySymbolMap[key.trim()] ?? key.trim());
  return (
    <span className="flex flex-row space-x-0.5">
      {keys.map((key, index) => (
        <kbd
          key={index}
          className={shortcutBadgeVariants({ variant, size, className })}
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

interface PlacedImage {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  isGenerated?: boolean;
  parentGroupId?: string;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
}

interface HistoryState {
  images: PlacedImage[];
  selectedIds: string[];
}

interface GenerationSettings {
  prompt: string;
  loraUrl: string;
  styleId?: string;
}

interface ActiveGeneration {
  imageUrl: string;
  prompt: string;
  loraUrl?: string;
}

interface SelectionBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  visible: boolean;
}

// Component for handling streaming generation
const StreamingImage: React.FC<{
  imageId: string;
  generation: ActiveGeneration;
  onComplete: (imageId: string, finalUrl: string) => void;
  onError: (imageId: string, error: string) => void;
  onStreamingUpdate: (imageId: string, url: string) => void;
  apiKey?: string;
}> = ({
  imageId,
  generation,
  onComplete,
  onError,
  onStreamingUpdate,
  apiKey,
}) => {
  const subscription = useSubscription(
    useTRPC().generateImageStream.subscriptionOptions(
      {
        imageUrl: generation.imageUrl,
        prompt: generation.prompt,
        ...(generation.loraUrl ? { loraUrl: generation.loraUrl } : {}),
        ...(apiKey ? { apiKey } : {}),
      },
      {
        enabled: true,
        onData: (data: any) => {
          const eventData = data.data;

          if (eventData.type === "progress") {
            const event = eventData.data;
            if (event.images && event.images.length > 0) {
              onStreamingUpdate(imageId, event.images[0].url);
            }
          } else if (eventData.type === "complete") {
            onComplete(imageId, eventData.imageUrl);
          } else if (eventData.type === "error") {
            onError(imageId, eventData.error);
          }
        },
        onError: (error) => {
          console.error("Subscription error:", error);
          onError(imageId, error.message || "Generation failed");
        },
      }
    )
  );

  return null;
};

// Crop overlay component
const CropOverlay: React.FC<{
  image: PlacedImage;
  imageElement: HTMLImageElement;
  onCropChange: (crop: {
    cropX: number;
    cropY: number;
    cropWidth: number;
    cropHeight: number;
  }) => void;
  onCropEnd: () => void;
}> = ({ image, imageElement, onCropChange, onCropEnd }) => {
  const cropRectRef = useRef<Konva.Rect>(null);
  const cropTransformerRef = useRef<Konva.Transformer>(null);
  const [grid, setGrid] = useState<Array<{ points: number[] }>>([]);
  const [isHoveringDone, setIsHoveringDone] = useState(false);

  // Initialize crop values (default to full image if not set)
  const cropX = (image.cropX ?? 0) * image.width;
  const cropY = (image.cropY ?? 0) * image.height;
  const cropWidth = (image.cropWidth ?? 1) * image.width;
  const cropHeight = (image.cropHeight ?? 1) * image.height;

  React.useEffect(() => {
    if (cropRectRef.current && cropTransformerRef.current) {
      cropTransformerRef.current.nodes([cropRectRef.current]);
      cropTransformerRef.current.getLayer()?.batchDraw();
    }
  }, []);

  // Update grid lines
  const updateGrid = (width: number, height: number) => {
    const newGrid: Array<{ points: number[] }> = [];
    const stepX = width / 3;
    const stepY = height / 3;

    for (let i = 1; i <= 2; i++) {
      // Vertical lines
      newGrid.push({ points: [stepX * i, 0, stepX * i, height] });
      // Horizontal lines
      newGrid.push({ points: [0, stepY * i, width, stepY * i] });
    }

    setGrid(newGrid);
  };

  React.useEffect(() => {
    updateGrid(cropWidth, cropHeight);
  }, [cropWidth, cropHeight]);

  const handleTransform = () => {
    const node = cropRectRef.current;
    if (!node) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    // Reset scale
    node.scaleX(1);
    node.scaleY(1);

    let newX = node.x();
    let newY = node.y();
    let newWidth = Math.max(20, node.width() * scaleX);
    let newHeight = Math.max(20, node.height() * scaleY);

    // Constrain to image bounds
    if (newX < 0) newX = 0;
    if (newY < 0) newY = 0;
    if (newX + newWidth > image.width) {
      newWidth = image.width - newX;
    }
    if (newY + newHeight > image.height) {
      newHeight = image.height - newY;
    }

    node.setAttrs({
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
    });

    updateGrid(newWidth, newHeight);

    onCropChange({
      cropX: newX / image.width,
      cropY: newY / image.height,
      cropWidth: newWidth / image.width,
      cropHeight: newHeight / image.height,
    });
  };

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    let newX = node.x();
    let newY = node.y();

    // Constrain to image bounds
    if (newX < 0) newX = 0;
    if (newY < 0) newY = 0;
    if (newX + node.width() > image.width) {
      newX = image.width - node.width();
    }
    if (newY + node.height() > image.height) {
      newY = image.height - node.height();
    }

    node.setAttrs({
      x: newX,
      y: newY,
    });
  };

  const handleDragEnd = () => {
    const node = cropRectRef.current;
    if (!node) return;

    onCropChange({
      cropX: node.x() / image.width,
      cropY: node.y() / image.height,
      cropWidth: node.width() / image.width,
      cropHeight: node.height() / image.height,
    });
  };

  return (
    <Group x={image.x} y={image.y} name="crop-overlay">
      {/* Semi-transparent mask */}
      <Rect
        width={image.width}
        height={image.height}
        fill="black"
        opacity={0.5}
        listening={false}
      />

      {/* Clipped image (visible crop area) */}
      <Group
        clip={{
          x: cropX,
          y: cropY,
          width: cropWidth,
          height: cropHeight,
        }}
      >
        <KonvaImage
          image={imageElement}
          width={image.width}
          height={image.height}
        />
      </Group>

      {/* Grid lines */}
      <Group x={cropX} y={cropY}>
        {grid.map((line, index) => (
          <Line
            key={index}
            points={line.points}
            stroke="white"
            strokeWidth={1}
            opacity={0.5}
          />
        ))}
      </Group>

      {/* Crop rectangle */}
      <Rect
        ref={cropRectRef}
        x={cropX}
        y={cropY}
        width={cropWidth}
        height={cropHeight}
        stroke="#3b82f6"
        strokeWidth={2}
        draggable
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransform}
      />

      {/* Transformer */}
      <Transformer
        ref={cropTransformerRef}
        boundBoxFunc={(oldBox, newBox) => {
          // Limit minimum size
          if (newBox.width < 20 || newBox.height < 20) {
            return oldBox;
          }
          return newBox;
        }}
        enabledAnchors={[
          "top-left",
          "top-center",
          "top-right",
          "middle-left",
          "middle-right",
          "bottom-left",
          "bottom-center",
          "bottom-right",
        ]}
        rotateEnabled={false}
        flipEnabled={false}
      />

      {/* Done button - styled to match our button component */}
      <Group
        x={cropX + cropWidth - 70}
        y={cropY - 45}
        onMouseEnter={() => setIsHoveringDone(true)}
        onMouseLeave={() => setIsHoveringDone(false)}
        onClick={onCropEnd}
        onTap={onCropEnd}
      >
        <Rect
          width={70}
          height={36}
          fill={isHoveringDone ? "#2563eb" : "#3b82f6"}
          cornerRadius={6}
          shadowColor="black"
          shadowBlur={8}
          shadowOpacity={0.15}
          shadowOffsetY={2}
        />
        <Text
          text="Done"
          fontSize={14}
          fontFamily="system-ui, -apple-system, sans-serif"
          fontStyle="500"
          fill="white"
          width={70}
          height={36}
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      </Group>
    </Group>
  );
};

// Custom hook for streaming images that prevents flickering
const useStreamingImage = (src: string) => {
  const [currentImage, setCurrentImage] = useState<
    HTMLImageElement | undefined
  >(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const loadingRef = useRef<{ src: string; img: HTMLImageElement } | null>(
    null
  );

  useEffect(() => {
    if (!src) {
      setCurrentImage(undefined);
      return;
    }

    // If we already have this image loaded, don't reload it
    if (currentImage && currentImage.src === src) {
      return;
    }

    // If we're already loading this exact URL, don't start another load
    if (loadingRef.current && loadingRef.current.src === src) {
      return;
    }

    setIsLoading(true);
    const img = new window.Image();
    img.crossOrigin = "anonymous";

    loadingRef.current = { src, img };

    img.onload = () => {
      // Only update if this is still the image we want to load
      if (loadingRef.current && loadingRef.current.src === src) {
        setCurrentImage(img);
        setIsLoading(false);
        loadingRef.current = null;
      }
    };

    img.onerror = () => {
      if (loadingRef.current && loadingRef.current.src === src) {
        setIsLoading(false);
        loadingRef.current = null;
      }
    };

    img.src = src;

    return () => {
      // Clean up if component unmounts or src changes before load completes
      if (loadingRef.current && loadingRef.current.src === src) {
        loadingRef.current = null;
      }
    };
  }, [src]);

  return [currentImage, isLoading] as const;
};

// Wrapper component to handle image loading for crop overlay
const CropOverlayWrapper: React.FC<{
  image: PlacedImage;
  onCropChange: (crop: {
    cropX: number;
    cropY: number;
    cropWidth: number;
    cropHeight: number;
  }) => void;
  onCropEnd: () => void;
}> = ({ image, onCropChange, onCropEnd }) => {
  const [img] = useImage(image.src, "anonymous");

  if (!img) return null;

  return (
    <CropOverlay
      image={image}
      imageElement={img}
      onCropChange={onCropChange}
      onCropEnd={onCropEnd}
    />
  );
};

// Component for rendering individual images on the canvas
const CanvasImage: React.FC<{
  image: PlacedImage;
  isSelected: boolean;
  onSelect: (e: any) => void;
  onChange: (newAttrs: Partial<PlacedImage>) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDoubleClick?: () => void;
  selectedIds: string[];
  images: PlacedImage[];
  setImages: React.Dispatch<React.SetStateAction<PlacedImage[]>>;
  isDraggingImage: boolean;
  dragStartPositions: Map<string, { x: number; y: number }>;
}> = ({
  image,
  isSelected,
  onSelect,
  onChange,
  onDragStart,
  onDragEnd,
  onDoubleClick,
  selectedIds,
  images,
  setImages,
  isDraggingImage,
  dragStartPositions,
}) => {
  const shapeRef = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);
  // Use streaming image hook for generated images to prevent flicker
  const [streamingImg] = useStreamingImage(image.isGenerated ? image.src : "");
  const [normalImg] = useImage(image.isGenerated ? "" : image.src, "anonymous");
  const img = image.isGenerated ? streamingImg : normalImg;
  const [isHovered, setIsHovered] = useState(false);

  React.useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      // Only show transformer if this is the only selected item or if clicking on it
      if (selectedIds.length === 1) {
        trRef.current.nodes([shapeRef.current]);
        trRef.current.getLayer()?.batchDraw();
      } else {
        trRef.current.nodes([]);
      }
    }
  }, [isSelected, selectedIds.length]);

  return (
    <>
      <KonvaImage
        ref={shapeRef}
        image={img}
        x={image.x}
        y={image.y}
        width={image.width}
        height={image.height}
        rotation={image.rotation}
        crop={
          image.cropX !== undefined
            ? {
                x: (image.cropX || 0) * (img?.naturalWidth || 0),
                y: (image.cropY || 0) * (img?.naturalHeight || 0),
                width: (image.cropWidth || 1) * (img?.naturalWidth || 0),
                height: (image.cropHeight || 1) * (img?.naturalHeight || 0),
              }
            : undefined
        }
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={onDoubleClick}
        onDblTap={onDoubleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onDragStart={(e) => {
          // Stop propagation to prevent stage from being dragged
          e.cancelBubble = true;
          // Auto-select on drag if not already selected
          if (!isSelected) {
            onSelect(e);
          }
          onDragStart();
        }}
        onDragMove={(e) => {
          const node = e.target;

          if (selectedIds.includes(image.id) && selectedIds.length > 1) {
            // Calculate delta from drag start position
            const startPos = dragStartPositions.get(image.id);
            if (startPos) {
              const deltaX = node.x() - startPos.x;
              const deltaY = node.y() - startPos.y;

              // Update all selected items relative to their start positions
              setImages((prev) =>
                prev.map((img) => {
                  if (img.id === image.id) {
                    return { ...img, x: node.x(), y: node.y() };
                  } else if (selectedIds.includes(img.id)) {
                    const imgStartPos = dragStartPositions.get(img.id);
                    if (imgStartPos) {
                      return {
                        ...img,
                        x: imgStartPos.x + deltaX,
                        y: imgStartPos.y + deltaY,
                      };
                    }
                  }
                  return img;
                })
              );
            }
          } else {
            // Single item drag - just update this image
            onChange({
              x: node.x(),
              y: node.y(),
            });
          }
        }}
        onDragEnd={(e) => {
          onDragEnd();
        }}
        onTransformEnd={(e) => {
          const node = shapeRef.current;
          if (node) {
            const scaleX = node.scaleX();
            const scaleY = node.scaleY();

            node.scaleX(1);
            node.scaleY(1);

            onChange({
              x: node.x(),
              y: node.y(),
              width: Math.max(5, node.width() * scaleX),
              height: Math.max(5, node.height() * scaleY),
              rotation: node.rotation(),
            });
          }
          onDragEnd();
        }}
        opacity={image.isGenerated ? 0.9 : 1}
        stroke={isSelected ? "#3b82f6" : isHovered ? "#3b82f6" : "transparent"}
        strokeWidth={isSelected || isHovered ? 2 : 0}
      />
      {isSelected && selectedIds.length === 1 && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </>
  );
};

export default function OverlayPage() {
  const [images, setImages] = useState<PlacedImage[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Get the overlay style model
  const overlayStyle = styleModels.find((m) => m.overlay);
  const simpsonsStyle = styleModels.find((m) => m.id === "simpsons");
  const { toast } = useToast();

  const [generationSettings, setGenerationSettings] =
    useState<GenerationSettings>({
      prompt: simpsonsStyle?.prompt || "",
      loraUrl: simpsonsStyle?.loraUrl || "",
      styleId: simpsonsStyle?.id || "simpsons",
    });
  const [showSettings, setShowSettings] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeGenerations, setActiveGenerations] = useState<
    Map<string, ActiveGeneration>
  >(new Map());
  const [selectionBox, setSelectionBox] = useState<SelectionBox>({
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    visible: false,
  });
  const [isSelecting, setIsSelecting] = useState(false);
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [dragStartPositions, setDragStartPositions] = useState<
    Map<string, { x: number; y: number }>
  >(new Map());
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [canvasSize, setCanvasSize] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1200,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  });
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [croppingImageId, setCroppingImageId] = useState<string | null>(null);
  const [viewport, setViewport] = useState({
    x: 0,
    y: 0,
    scale: 1,
  });
  const [isDraggingStage, setIsDraggingStage] = useState(false);
  const stageRef = useRef<Konva.Stage>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isolateTarget, setIsolateTarget] = useState<string | null>(null);
  const [isolateInputValue, setIsolateInputValue] = useState("");
  const [isIsolating, setIsIsolating] = useState(false);
  const [isStyleDialogOpen, setIsStyleDialogOpen] = useState(false);
  const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);
  const [customApiKey, setCustomApiKey] = useState<string>("");
  const [tempApiKey, setTempApiKey] = useState<string>("");

  // Touch event states for mobile
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(
    null
  );
  const [lastTouchCenter, setLastTouchCenter] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isTouchingImage, setIsTouchingImage] = useState(false);

  const trpc = useTRPC();
  const { mutateAsync: uploadImage } = useMutation(
    trpc.uploadImage.mutationOptions()
  );

  const { mutateAsync: removeBackground } = useMutation(
    trpc.removeBackground.mutationOptions()
  );

  const { mutateAsync: isolateObject } = useMutation(
    trpc.isolateObject.mutationOptions()
  );

  const { mutateAsync: generateTextToImage } = useMutation(
    trpc.generateTextToImage.mutationOptions()
  );

  // Check OS for keyboard shortcut display
  const checkOS = (os?: string) => {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return false;
    }
    const platform = navigator.platform;
    if (os === "Win") return platform.startsWith("Win");
    if (os === "Linux") return platform.startsWith("Linux");
    if (os === "Mac") return platform.startsWith("Mac");
    return false;
  };

  // Load API key from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem("fal-api-key");
    if (savedKey) {
      setCustomApiKey(savedKey);
      setTempApiKey(savedKey);
    }
  }, []);

  // Save API key to localStorage when it changes
  useEffect(() => {
    if (customApiKey) {
      localStorage.setItem("fal-api-key", customApiKey);
    } else {
      localStorage.removeItem("fal-api-key");
    }
  }, [customApiKey]);

  // Save state to history
  const saveToHistory = useCallback(() => {
    const newState = { images: [...images], selectedIds: [...selectedIds] };
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newState);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [images, selectedIds, history, historyIndex]);

  // Undo
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      setImages(prevState.images);
      setSelectedIds(prevState.selectedIds);
      setHistoryIndex(historyIndex - 1);
    }
  }, [history, historyIndex]);

  // Redo
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setImages(nextState.images);
      setSelectedIds(nextState.selectedIds);
      setHistoryIndex(historyIndex + 1);
    }
  }, [history, historyIndex]);

  // Save initial state
  useEffect(() => {
    if (history.length === 0) {
      saveToHistory();
    }
  }, []);

  // Set canvas ready state after mount
  useEffect(() => {
    // Only set canvas ready after we have valid dimensions
    if (canvasSize.width > 0 && canvasSize.height > 0) {
      setIsCanvasReady(true);
    }
  }, [canvasSize]);

  // Update canvas size on window resize
  useEffect(() => {
    const updateCanvasSize = () => {
      setCanvasSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    // Set initial size
    updateCanvasSize();

    // Update on resize
    window.addEventListener("resize", updateCanvasSize);
    return () => window.removeEventListener("resize", updateCanvasSize);
  }, []);

  // Prevent body scrolling on mobile
  useEffect(() => {
    // Prevent scrolling on mobile
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    document.body.style.height = "100%";

    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.height = "";
    };
  }, []);

  // Check if screen is desktop-sized
  useEffect(() => {
    const checkScreenSize = () => {
      setIsDesktop(window.innerWidth >= 1250);
    };

    // Check on mount
    checkScreenSize();

    // Check on resize
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  // Load default images
  useEffect(() => {
    const loadDefaultImages = async () => {
      const defaultImagePaths = [
        "/hat.png",
        "/man.png",
        "/dog.png",
        "/overlay.png",
      ];
      const loadedImages: PlacedImage[] = [];

      for (let i = 0; i < defaultImagePaths.length; i++) {
        const path = defaultImagePaths[i];
        try {
          const response = await fetch(path);
          const blob = await response.blob();
          const reader = new FileReader();

          reader.onload = (e) => {
            const img = new window.Image();
            img.crossOrigin = "anonymous"; // Enable CORS
            img.onload = () => {
              const id = `default-${path.replace("/", "").replace(".png", "")}-${Date.now()}`;
              const aspectRatio = img.width / img.height;
              const maxSize = 200;
              let width = maxSize;
              let height = maxSize / aspectRatio;

              if (height > maxSize) {
                height = maxSize;
                width = maxSize * aspectRatio;
              }

              // Position images in a row at center of viewport
              const spacing = 250;
              const totalWidth = spacing * (defaultImagePaths.length - 1);
              const viewportCenterX = canvasSize.width / 2;
              const viewportCenterY = canvasSize.height / 2;
              const startX = viewportCenterX - totalWidth / 2;
              const x = startX + i * spacing - width / 2;
              const y = viewportCenterY - height / 2;

              setImages((prev) => [
                ...prev,
                {
                  id,
                  src: e.target?.result as string,
                  x,
                  y,
                  width,
                  height,
                  rotation: 0,
                },
              ]);
            };
            img.src = e.target?.result as string;
          };

          reader.readAsDataURL(blob);
        } catch (error) {
          console.error(`Failed to load default image ${path}:`, error);
        }
      }
    };

    loadDefaultImages();
  }, []);

  // Helper function to create a cropped image
  const createCroppedImage = async (
    imageSrc: string,
    cropX: number,
    cropY: number,
    cropWidth: number,
    cropHeight: number
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = "anonymous"; // Enable CORS
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // Set canvas size to the natural cropped dimensions
        canvas.width = cropWidth * img.naturalWidth;
        canvas.height = cropHeight * img.naturalHeight;

        // Draw the cropped portion at full resolution
        ctx.drawImage(
          img,
          cropX * img.naturalWidth,
          cropY * img.naturalHeight,
          cropWidth * img.naturalWidth,
          cropHeight * img.naturalHeight,
          0,
          0,
          canvas.width,
          canvas.height
        );

        // Convert to data URL
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("Failed to create blob"));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        }, "image/png");
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = imageSrc;
    });
  };

  // Handle file upload
  const handleFileUpload = (
    files: FileList | null,
    position?: { x: number; y: number }
  ) => {
    if (!files) return;

    Array.from(files).forEach((file, index) => {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const id = `img-${Date.now()}-${Math.random()}`;
          const img = new window.Image();
          img.crossOrigin = "anonymous"; // Enable CORS
          img.onload = () => {
            const aspectRatio = img.width / img.height;
            const maxSize = 300;
            let width = maxSize;
            let height = maxSize / aspectRatio;

            if (height > maxSize) {
              height = maxSize;
              width = maxSize * aspectRatio;
            }

            // Place image at position or center of current viewport
            let x, y;
            if (position) {
              // Convert screen position to canvas coordinates
              x = (position.x - viewport.x) / viewport.scale - width / 2;
              y = (position.y - viewport.y) / viewport.scale - height / 2;
            } else {
              // Center of viewport
              const viewportCenterX =
                (canvasSize.width / 2 - viewport.x) / viewport.scale;
              const viewportCenterY =
                (canvasSize.height / 2 - viewport.y) / viewport.scale;
              x = viewportCenterX - width / 2;
              y = viewportCenterY - height / 2;
            }

            // Add offset for multiple files
            if (index > 0) {
              x += index * 20;
              y += index * 20;
            }

            setImages((prev) => [
              ...prev,
              {
                id,
                src: e.target?.result as string,
                x,
                y,
                width,
                height,
                rotation: 0,
              },
            ]);
          };
          img.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
      }
    });
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    // Get drop position relative to the stage
    const stage = stageRef.current;
    if (stage) {
      const container = stage.container();
      const rect = container.getBoundingClientRect();
      const dropPosition = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      handleFileUpload(e.dataTransfer.files, dropPosition);
    } else {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  // Handle wheel for zoom
  const handleWheel = (e: any) => {
    e.evt.preventDefault();

    const stage = stageRef.current;
    if (!stage) return;

    // Check if this is a pinch gesture (ctrl key is pressed on trackpad pinch)
    if (e.evt.ctrlKey) {
      // This is a pinch-to-zoom gesture
      const oldScale = viewport.scale;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const mousePointTo = {
        x: (pointer.x - viewport.x) / oldScale,
        y: (pointer.y - viewport.y) / oldScale,
      };

      // Zoom based on deltaY (negative = zoom in, positive = zoom out)
      const scaleBy = 1.01;
      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const steps = Math.min(Math.abs(e.evt.deltaY), 10);
      let newScale = oldScale;

      for (let i = 0; i < steps; i++) {
        newScale = direction > 0 ? newScale * scaleBy : newScale / scaleBy;
      }

      // Limit zoom (10% to 500%)
      const scale = Math.max(0.1, Math.min(5, newScale));

      const newPos = {
        x: pointer.x - mousePointTo.x * scale,
        y: pointer.y - mousePointTo.y * scale,
      };

      setViewport({ x: newPos.x, y: newPos.y, scale });
    } else {
      // This is a pan gesture (two-finger swipe on trackpad or mouse wheel)
      const deltaX = e.evt.shiftKey ? e.evt.deltaY : e.evt.deltaX;
      const deltaY = e.evt.shiftKey ? 0 : e.evt.deltaY;

      // Invert the direction to match natural scrolling
      setViewport((prev) => ({
        ...prev,
        x: prev.x - deltaX,
        y: prev.y - deltaY,
      }));
    }
  };

  // Touch event handlers for mobile
  const handleTouchStart = (e: any) => {
    const touches = e.evt.touches;
    const stage = stageRef.current;

    if (touches.length === 2) {
      // Two fingers - prepare for pinch-to-zoom
      const touch1 = { x: touches[0].clientX, y: touches[0].clientY };
      const touch2 = { x: touches[1].clientX, y: touches[1].clientY };

      const distance = Math.sqrt(
        Math.pow(touch2.x - touch1.x, 2) + Math.pow(touch2.y - touch1.y, 2)
      );

      const center = {
        x: (touch1.x + touch2.x) / 2,
        y: (touch1.y + touch2.y) / 2,
      };

      setLastTouchDistance(distance);
      setLastTouchCenter(center);
    } else if (touches.length === 1) {
      // Single finger - check if touching an image
      const touch = { x: touches[0].clientX, y: touches[0].clientY };

      // Check if we're touching an image
      if (stage) {
        const pos = stage.getPointerPosition();
        if (pos) {
          const canvasPos = {
            x: (pos.x - viewport.x) / viewport.scale,
            y: (pos.y - viewport.y) / viewport.scale,
          };

          // Check if touch is on any image
          const touchedImage = images.some((img) => {
            return (
              canvasPos.x >= img.x &&
              canvasPos.x <= img.x + img.width &&
              canvasPos.y >= img.y &&
              canvasPos.y <= img.y + img.height
            );
          });

          setIsTouchingImage(touchedImage);
        }
      }

      setLastTouchCenter(touch);
    }
  };

  const handleTouchMove = (e: any) => {
    const touches = e.evt.touches;

    if (touches.length === 2 && lastTouchDistance && lastTouchCenter) {
      // Two fingers - handle pinch-to-zoom
      e.evt.preventDefault();

      const touch1 = { x: touches[0].clientX, y: touches[0].clientY };
      const touch2 = { x: touches[1].clientX, y: touches[1].clientY };

      const distance = Math.sqrt(
        Math.pow(touch2.x - touch1.x, 2) + Math.pow(touch2.y - touch1.y, 2)
      );

      const center = {
        x: (touch1.x + touch2.x) / 2,
        y: (touch1.y + touch2.y) / 2,
      };

      // Calculate scale change
      const scaleFactor = distance / lastTouchDistance;
      const newScale = Math.max(0.1, Math.min(5, viewport.scale * scaleFactor));

      // Calculate new position to zoom towards pinch center
      const stage = stageRef.current;
      if (stage) {
        const stageBox = stage.container().getBoundingClientRect();
        const stageCenter = {
          x: center.x - stageBox.left,
          y: center.y - stageBox.top,
        };

        const mousePointTo = {
          x: (stageCenter.x - viewport.x) / viewport.scale,
          y: (stageCenter.y - viewport.y) / viewport.scale,
        };

        const newPos = {
          x: stageCenter.x - mousePointTo.x * newScale,
          y: stageCenter.y - mousePointTo.y * newScale,
        };

        setViewport({ x: newPos.x, y: newPos.y, scale: newScale });
      }

      setLastTouchDistance(distance);
      setLastTouchCenter(center);
    } else if (
      touches.length === 1 &&
      lastTouchCenter &&
      !isSelecting &&
      !isDraggingImage &&
      !isTouchingImage
    ) {
      // Single finger - handle pan (only if not selecting, dragging, or touching an image)
      e.evt.preventDefault();

      const touch = { x: touches[0].clientX, y: touches[0].clientY };
      const deltaX = touch.x - lastTouchCenter.x;
      const deltaY = touch.y - lastTouchCenter.y;

      setViewport((prev) => ({
        ...prev,
        x: prev.x + deltaX,
        y: prev.y + deltaY,
      }));

      setLastTouchCenter(touch);
    }
  };

  const handleTouchEnd = (e: any) => {
    setLastTouchDistance(null);
    setLastTouchCenter(null);
    setIsTouchingImage(false);
  };

  // Handle selection
  const handleSelect = (id: string, e: any) => {
    if (e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey) {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
      );
    } else {
      setSelectedIds([id]);
    }
  };

  // Handle drag selection and panning
  const handleMouseDown = (e: any) => {
    const clickedOnEmpty = e.target === e.target.getStage();
    const stage = e.target.getStage();

    // If in crop mode and clicked outside, exit crop mode
    if (croppingImageId) {
      const clickedNode = e.target;
      const cropGroup = clickedNode.findAncestor((node: any) => {
        return node.attrs && node.attrs.name === "crop-overlay";
      });

      if (!cropGroup) {
        setCroppingImageId(null);
        return;
      }
    }

    // Start selection box when clicking on empty space
    if (clickedOnEmpty && !croppingImageId) {
      const pos = stage.getPointerPosition();
      if (pos) {
        // Convert screen coordinates to canvas coordinates
        const canvasPos = {
          x: (pos.x - viewport.x) / viewport.scale,
          y: (pos.y - viewport.y) / viewport.scale,
        };

        setIsSelecting(true);
        setSelectionBox({
          startX: canvasPos.x,
          startY: canvasPos.y,
          endX: canvasPos.x,
          endY: canvasPos.y,
          visible: true,
        });
        setSelectedIds([]);
      }
    }
  };

  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage();

    // Handle selection
    if (!isSelecting) return;

    const pos = stage.getPointerPosition();
    if (pos) {
      // Convert screen coordinates to canvas coordinates
      const canvasPos = {
        x: (pos.x - viewport.x) / viewport.scale,
        y: (pos.y - viewport.y) / viewport.scale,
      };

      setSelectionBox((prev) => ({
        ...prev,
        endX: canvasPos.x,
        endY: canvasPos.y,
      }));
    }
  };

  const handleMouseUp = (e: any) => {
    if (!isSelecting) return;

    // Calculate which images are in the selection box
    const box = {
      x: Math.min(selectionBox.startX, selectionBox.endX),
      y: Math.min(selectionBox.startY, selectionBox.endY),
      width: Math.abs(selectionBox.endX - selectionBox.startX),
      height: Math.abs(selectionBox.endY - selectionBox.startY),
    };

    // Only select if the box has some size
    if (box.width > 5 || box.height > 5) {
      const selected = images.filter((img) => {
        // Check if image intersects with selection box
        return !(
          img.x + img.width < box.x ||
          img.x > box.x + box.width ||
          img.y + img.height < box.y ||
          img.y > box.y + box.height
        );
      });

      if (selected.length > 0) {
        setSelectedIds(selected.map((img) => img.id));
      }
    }

    setIsSelecting(false);
    setSelectionBox({ ...selectionBox, visible: false });
  };

  // Note: Overlapping detection has been removed in favor of explicit "Combine Images" action
  // Users can now manually combine images via the context menu before running generation

  // Handle context menu actions
  const handleRun = async () => {
    if (!generationSettings.prompt) {
      setShowSettings(true);
      toast({
        title: "No Prompt",
        description: "Please enter a prompt to generate an image",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    const selectedImages = images.filter((img) => selectedIds.includes(img.id));

    // If no images are selected, do text-to-image generation
    if (selectedImages.length === 0) {
      try {
        toast({
          title: "Generating image...",
          description: "Creating image from text prompt",
        });

        const result = await generateTextToImage({
          prompt: generationSettings.prompt,
          loraUrl: generationSettings.loraUrl || undefined,
          imageSize: "square",
          apiKey: customApiKey || undefined,
        });

        // Add the generated image to the canvas
        const id = `generated-${Date.now()}-${Math.random()}`;

        // Place at center of viewport
        const viewportCenterX =
          (canvasSize.width / 2 - viewport.x) / viewport.scale;
        const viewportCenterY =
          (canvasSize.height / 2 - viewport.y) / viewport.scale;

        // Use the actual dimensions from the result
        const width = Math.min(result.width, 512); // Limit display size
        const height = Math.min(result.height, 512);

        setImages((prev) => [
          ...prev,
          {
            id,
            src: result.url,
            x: viewportCenterX - width / 2,
            y: viewportCenterY - height / 2,
            width,
            height,
            rotation: 0,
            isGenerated: true,
          },
        ]);

        // Select the new image
        setSelectedIds([id]);

        toast({
          title: "Success",
          description: "Image generated successfully",
        });
      } catch (error) {
        console.error("Error generating image:", error);
        toast({
          title: "Generation failed",
          description:
            error instanceof Error ? error.message : "Failed to generate image",
          variant: "destructive",
        });
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    // Process each selected image individually for image-to-image
    for (const img of selectedImages) {
      try {
        // Get crop values
        const cropX = img.cropX || 0;
        const cropY = img.cropY || 0;
        const cropWidth = img.cropWidth || 1;
        const cropHeight = img.cropHeight || 1;

        // Load the image
        const imgElement = new window.Image();
        imgElement.crossOrigin = "anonymous"; // Enable CORS
        imgElement.src = img.src;
        await new Promise((resolve) => {
          imgElement.onload = resolve;
        });

        // Create a canvas for the image at original resolution
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Failed to get canvas context");

        // Calculate the effective original dimensions accounting for crops
        let effectiveWidth = imgElement.naturalWidth;
        let effectiveHeight = imgElement.naturalHeight;

        if (cropWidth !== 1 || cropHeight !== 1) {
          effectiveWidth = cropWidth * imgElement.naturalWidth;
          effectiveHeight = cropHeight * imgElement.naturalHeight;
        }

        // Set canvas size to the original resolution (not display size)
        canvas.width = effectiveWidth;
        canvas.height = effectiveHeight;

        console.log(
          `Processing image at ${canvas.width}x${canvas.height} (original res, display: ${img.width}x${img.height})`
        );

        // Always use the crop values (default to full image if not set)
        ctx.drawImage(
          imgElement,
          cropX * imgElement.naturalWidth,
          cropY * imgElement.naturalHeight,
          cropWidth * imgElement.naturalWidth,
          cropHeight * imgElement.naturalHeight,
          0,
          0,
          canvas.width,
          canvas.height
        );

        // Convert to blob and upload
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((blob) => resolve(blob!), "image/png");
        });

        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve) => {
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(blob);
        });

        const uploadResult = await uploadImage({
          image: dataUrl,
          apiKey: customApiKey || undefined,
        });

        // Calculate output size maintaining aspect ratio
        const aspectRatio = canvas.width / canvas.height;
        const baseSize = 512;
        let outputWidth = baseSize;
        let outputHeight = baseSize;

        if (aspectRatio > 1) {
          outputHeight = Math.round(baseSize / aspectRatio);
        } else {
          outputWidth = Math.round(baseSize * aspectRatio);
        }

        const groupId = `single-${Date.now()}-${Math.random()}`;
        generateImage(
          uploadResult.url,
          img.x + img.width + 20,
          img.y,
          groupId,
          outputWidth,
          outputHeight
        );
      } catch (error) {
        console.error("Error processing image:", error);
        toast({
          title: "Failed to process image",
          description:
            error instanceof Error ? error.message : "Failed to process image",
          variant: "destructive",
        });
      }
    }

    // Done processing all images
    setIsGenerating(false);
  };

  const generateImage = (
    imageUrl: string,
    x: number,
    y: number,
    groupId: string,
    width: number = 300,
    height: number = 300
  ) => {
    const placeholderId = `generated-${Date.now()}`;
    setImages((prev) => [
      ...prev,
      {
        id: placeholderId,
        src: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        x,
        y,
        width,
        height,
        rotation: 0,
        isGenerated: true,
        parentGroupId: groupId,
      },
    ]);

    // Store generation params
    setActiveGenerations((prev) =>
      new Map(prev).set(placeholderId, {
        imageUrl,
        prompt: generationSettings.prompt,
        loraUrl: generationSettings.loraUrl,
      })
    );
  };

  const handleDelete = () => {
    // Save to history before deleting
    saveToHistory();
    setImages((prev) => prev.filter((img) => !selectedIds.includes(img.id)));
    setSelectedIds([]);
  };

  const handleDuplicate = () => {
    // Save to history before duplicating
    saveToHistory();
    const selectedImages = images.filter((img) => selectedIds.includes(img.id));
    const newImages = selectedImages.map((img) => ({
      ...img,
      id: `img-${Date.now()}-${Math.random()}`,
      x: img.x + 20,
      y: img.y + 20,
    }));
    setImages((prev) => [...prev, ...newImages]);
    setSelectedIds(newImages.map((img) => img.id));
  };

  const handleRemoveBackground = async () => {
    if (selectedIds.length === 0) return;

    try {
      saveToHistory();

      for (const imageId of selectedIds) {
        const image = images.find((img) => img.id === imageId);
        if (!image) continue;

        // Show loading state
        toast({
          title: "Processing...",
          description: "Removing background from image",
        });

        // Process the image to get the cropped/processed version
        const imgElement = new window.Image();
        imgElement.crossOrigin = "anonymous"; // Enable CORS
        imgElement.src = image.src;
        await new Promise((resolve) => {
          imgElement.onload = resolve;
        });

        // Create canvas for processing
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Failed to get canvas context");

        // Get crop values
        const cropX = image.cropX || 0;
        const cropY = image.cropY || 0;
        const cropWidth = image.cropWidth || 1;
        const cropHeight = image.cropHeight || 1;

        // Set canvas size based on crop
        canvas.width = cropWidth * imgElement.naturalWidth;
        canvas.height = cropHeight * imgElement.naturalHeight;

        // Draw cropped image
        ctx.drawImage(
          imgElement,
          cropX * imgElement.naturalWidth,
          cropY * imgElement.naturalHeight,
          cropWidth * imgElement.naturalWidth,
          cropHeight * imgElement.naturalHeight,
          0,
          0,
          canvas.width,
          canvas.height
        );

        // Convert to blob and upload
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((blob) => resolve(blob!), "image/png");
        });

        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve) => {
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(blob);
        });

        // Upload the processed image
        const uploadResult = await uploadImage({
          image: dataUrl,
          apiKey: customApiKey || undefined,
        });

        // Remove background using the API
        const result = await removeBackground({
          imageUrl: uploadResult.url,
          apiKey: customApiKey || undefined,
        });

        // Update the image in place
        setImages((prev) =>
          prev.map((img) =>
            img.id === imageId
              ? {
                  ...img,
                  src: result.url,
                  // Remove crop values since we've applied them
                  cropX: undefined,
                  cropY: undefined,
                  cropWidth: undefined,
                  cropHeight: undefined,
                }
              : img
          )
        );
      }

      toast({
        title: "Success",
        description: "Background removed successfully",
      });
    } catch (error) {
      console.error("Error removing background:", error);
      toast({
        title: "Failed to remove background",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleIsolate = async () => {
    if (!isolateTarget || !isolateInputValue.trim() || isIsolating) {
      return;
    }

    setIsIsolating(true);

    try {
      const image = images.find((img) => img.id === isolateTarget);
      if (!image) {
        setIsIsolating(false);
        return;
      }

      // Show loading state
      toast({
        title: "Processing...",
        description: `Isolating "${isolateInputValue}" from image`,
      });

      // Process the image to get the cropped/processed version
      const imgElement = new window.Image();
      imgElement.crossOrigin = "anonymous"; // Enable CORS
      imgElement.src = image.src;
      await new Promise((resolve) => {
        imgElement.onload = resolve;
      });

      // Create canvas for processing
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to get canvas context");

      // Get crop values
      const cropX = image.cropX || 0;
      const cropY = image.cropY || 0;
      const cropWidth = image.cropWidth || 1;
      const cropHeight = image.cropHeight || 1;

      // Set canvas size based on crop
      canvas.width = cropWidth * imgElement.naturalWidth;
      canvas.height = cropHeight * imgElement.naturalHeight;

      // Draw cropped image
      ctx.drawImage(
        imgElement,
        cropX * imgElement.naturalWidth,
        cropY * imgElement.naturalHeight,
        cropWidth * imgElement.naturalWidth,
        cropHeight * imgElement.naturalHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );

      // Convert to blob and upload
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => resolve(blob!), "image/png");
      });

      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(blob);
      });

      // Upload the processed image
      const uploadResult = await uploadImage({
        image: dataUrl,
        apiKey: customApiKey || undefined,
      });

      // Isolate object using EVF-SAM2
      console.log("Calling isolateObject with:", {
        imageUrl: uploadResult.url,
        textInput: isolateInputValue,
      });

      const result = await isolateObject({
        imageUrl: uploadResult.url,
        textInput: isolateInputValue,
        apiKey: customApiKey || undefined,
      });

      console.log("IsolateObject result:", result);

      // Use the segmented image URL directly (backend already applied the mask)
      if (result.url) {
        console.log("Original image URL:", image.src);
        console.log("New isolated image URL:", result.url);
        console.log("Result object:", JSON.stringify(result, null, 2));

        // AUTO DOWNLOAD FOR DEBUGGING
        try {
          const link = document.createElement("a");
          link.href = result.url;
          link.download = `isolated-${isolateInputValue}-${Date.now()}.png`;
          link.target = "_blank"; // Open in new tab to see the image
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          console.log("Auto-downloaded isolated image for debugging");
        } catch (e) {
          console.error("Failed to auto-download:", e);
        }

        // Force load the new image before updating state
        const testImg = new window.Image();
        testImg.crossOrigin = "anonymous";
        testImg.onload = () => {
          console.log(
            "New image loaded successfully:",
            testImg.width,
            "x",
            testImg.height
          );

          // Create a test canvas to verify the image has transparency
          const testCanvas = document.createElement("canvas");
          testCanvas.width = testImg.width;
          testCanvas.height = testImg.height;
          const testCtx = testCanvas.getContext("2d");
          if (testCtx) {
            // Fill with red background
            testCtx.fillStyle = "red";
            testCtx.fillRect(0, 0, testCanvas.width, testCanvas.height);
            // Draw the image on top
            testCtx.drawImage(testImg, 0, 0);

            // Get a pixel from what should be transparent area (corner)
            const pixelData = testCtx.getImageData(0, 0, 1, 1).data;
            console.log("Corner pixel (should show red if transparent):", {
              r: pixelData[0],
              g: pixelData[1],
              b: pixelData[2],
              a: pixelData[3],
            });
          }

          // Update the image in place with the segmented image
          saveToHistory();

          // Create a completely new image URL with timestamp
          const newImageUrl = `${result.url}${result.url.includes("?") ? "&" : "?"}t=${Date.now()}&cache=no`;

          // Get the current image to preserve position
          const currentImage = images.find((img) => img.id === isolateTarget);
          if (!currentImage) {
            console.error("Could not find current image!");
            return;
          }

          // Create new image with isolated- prefix ID
          const newImage: PlacedImage = {
            ...currentImage,
            id: `isolated-${Date.now()}-${Math.random()}`,
            src: newImageUrl,
            // Remove crop values since we've applied them
            cropX: undefined,
            cropY: undefined,
            cropWidth: undefined,
            cropHeight: undefined,
          };

          setImages((prev) => {
            // Replace old image with new one at same index
            const newImages = [...prev];
            const index = newImages.findIndex(
              (img) => img.id === isolateTarget
            );
            if (index !== -1) {
              newImages[index] = newImage;
            }
            return newImages;
          });

          // Update selection
          setSelectedIds([newImage.id]);

          toast({
            title: "Success",
            description: `Isolated "${isolateInputValue}" successfully`,
          });
        };

        testImg.onerror = (e) => {
          console.error("Failed to load new image:", e);
          toast({
            title: "Failed to load isolated image",
            description: "The isolated image could not be loaded",
            variant: "destructive",
          });
        };

        testImg.src = result.url;
      } else {
        toast({
          title: "No object found",
          description: `Could not find "${isolateInputValue}" in the image`,
          variant: "destructive",
        });
      }

      // Reset the isolate input
      setIsolateTarget(null);
      setIsolateInputValue("");
      setIsIsolating(false);
    } catch (error) {
      console.error("Error isolating object:", error);
      toast({
        title: "Failed to isolate object",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      setIsolateTarget(null);
      setIsolateInputValue("");
      setIsIsolating(false);
    }
  };

  const handleCombineImages = async () => {
    if (selectedIds.length < 2) return;

    // Save to history before combining
    saveToHistory();

    // Get selected images and sort by layer order
    const selectedImages = selectedIds
      .map((id) => images.find((img) => img.id === id))
      .filter((img) => img !== undefined) as PlacedImage[];

    const sortedImages = [...selectedImages].sort((a, b) => {
      const indexA = images.findIndex((img) => img.id === a.id);
      const indexB = images.findIndex((img) => img.id === b.id);
      return indexA - indexB;
    });

    // Load all images to calculate scale factors
    const imageElements: {
      img: PlacedImage;
      element: HTMLImageElement;
      scale: number;
    }[] = [];
    let maxScale = 1;

    for (const img of sortedImages) {
      const imgElement = new window.Image();
      imgElement.crossOrigin = "anonymous"; // Enable CORS
      imgElement.src = img.src;
      await new Promise((resolve) => {
        imgElement.onload = resolve;
      });

      // Calculate scale factor (original size / display size)
      // Account for crops if they exist
      const effectiveWidth = img.cropWidth
        ? imgElement.naturalWidth * img.cropWidth
        : imgElement.naturalWidth;
      const effectiveHeight = img.cropHeight
        ? imgElement.naturalHeight * img.cropHeight
        : imgElement.naturalHeight;

      const scaleX = effectiveWidth / img.width;
      const scaleY = effectiveHeight / img.height;
      const scale = Math.min(scaleX, scaleY); // Use min to maintain aspect ratio

      maxScale = Math.max(maxScale, scale);
      imageElements.push({ img, element: imgElement, scale });
    }

    // Use a reasonable scale - not too large to avoid memory issues
    const optimalScale = Math.min(maxScale, 4); // Cap at 4x to prevent huge images

    // Calculate bounding box of all selected images
    let minX = Infinity,
      minY = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity;

    sortedImages.forEach((img) => {
      minX = Math.min(minX, img.x);
      minY = Math.min(minY, img.y);
      maxX = Math.max(maxX, img.x + img.width);
      maxY = Math.max(maxY, img.y + img.height);
    });

    const combinedWidth = maxX - minX;
    const combinedHeight = maxY - minY;

    // Create canvas at higher resolution
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.error("Failed to get canvas context");
      return;
    }

    canvas.width = Math.round(combinedWidth * optimalScale);
    canvas.height = Math.round(combinedHeight * optimalScale);

    console.log(
      `Creating combined image at ${canvas.width}x${canvas.height} (scale: ${optimalScale.toFixed(2)}x)`
    );

    // Draw each image in order using the pre-loaded elements
    for (const { img, element: imgElement } of imageElements) {
      // Calculate position relative to the combined canvas, scaled up
      const relX = (img.x - minX) * optimalScale;
      const relY = (img.y - minY) * optimalScale;
      const scaledWidth = img.width * optimalScale;
      const scaledHeight = img.height * optimalScale;

      ctx.save();

      // Handle rotation if needed
      if (img.rotation) {
        ctx.translate(relX + scaledWidth / 2, relY + scaledHeight / 2);
        ctx.rotate((img.rotation * Math.PI) / 180);
        ctx.drawImage(
          imgElement,
          -scaledWidth / 2,
          -scaledHeight / 2,
          scaledWidth,
          scaledHeight
        );
      } else {
        // Handle cropping if exists
        if (
          img.cropX !== undefined &&
          img.cropY !== undefined &&
          img.cropWidth !== undefined &&
          img.cropHeight !== undefined
        ) {
          ctx.drawImage(
            imgElement,
            img.cropX * imgElement.naturalWidth,
            img.cropY * imgElement.naturalHeight,
            img.cropWidth * imgElement.naturalWidth,
            img.cropHeight * imgElement.naturalHeight,
            relX,
            relY,
            scaledWidth,
            scaledHeight
          );
        } else {
          ctx.drawImage(
            imgElement,
            0,
            0,
            imgElement.naturalWidth,
            imgElement.naturalHeight,
            relX,
            relY,
            scaledWidth,
            scaledHeight
          );
        }
      }

      ctx.restore();
    }

    // Convert to blob and create data URL
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((blob) => resolve(blob!), "image/png");
    });

    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve) => {
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsDataURL(blob);
    });

    // Create new combined image
    const combinedImage: PlacedImage = {
      id: `combined-${Date.now()}-${Math.random()}`,
      src: dataUrl,
      x: minX,
      y: minY,
      width: combinedWidth,
      height: combinedHeight,
      rotation: 0,
    };

    // Remove the original images and add the combined one
    setImages((prev) => [
      ...prev.filter((img) => !selectedIds.includes(img.id)),
      combinedImage,
    ]);

    // Select the new combined image
    setSelectedIds([combinedImage.id]);
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if target is an input element
      const isInputElement =
        e.target && (e.target as HTMLElement).matches("input, textarea");

      // Undo/Redo
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        (e.metaKey || e.ctrlKey) &&
        ((e.key === "z" && e.shiftKey) || e.key === "y")
      ) {
        e.preventDefault();
        redo();
      }
      // Select all
      else if ((e.metaKey || e.ctrlKey) && e.key === "a" && !isInputElement) {
        e.preventDefault();
        setSelectedIds(images.map((img) => img.id));
      }
      // Delete
      else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        !isInputElement
      ) {
        if (selectedIds.length > 0) {
          e.preventDefault();
          handleDelete();
        }
      }
      // Duplicate
      else if ((e.metaKey || e.ctrlKey) && e.key === "d" && !isInputElement) {
        e.preventDefault();
        if (selectedIds.length > 0) {
          handleDuplicate();
        }
      }
      // Run generation
      else if (
        (e.metaKey || e.ctrlKey) &&
        e.key === "Enter" &&
        !isInputElement
      ) {
        e.preventDefault();
        if (!isGenerating && generationSettings.prompt.trim()) {
          handleRun();
        }
      }
      // Escape to exit crop mode
      else if (e.key === "Escape" && croppingImageId) {
        e.preventDefault();
        setCroppingImageId(null);
      }
      // Zoom in
      else if ((e.key === "+" || e.key === "=") && !isInputElement) {
        e.preventDefault();
        const newScale = Math.min(5, viewport.scale * 1.2);
        const centerX = canvasSize.width / 2;
        const centerY = canvasSize.height / 2;

        const mousePointTo = {
          x: (centerX - viewport.x) / viewport.scale,
          y: (centerY - viewport.y) / viewport.scale,
        };

        setViewport({
          x: centerX - mousePointTo.x * newScale,
          y: centerY - mousePointTo.y * newScale,
          scale: newScale,
        });
      }
      // Zoom out
      else if (e.key === "-" && !isInputElement) {
        e.preventDefault();
        const newScale = Math.max(0.1, viewport.scale / 1.2);
        const centerX = canvasSize.width / 2;
        const centerY = canvasSize.height / 2;

        const mousePointTo = {
          x: (centerX - viewport.x) / viewport.scale,
          y: (centerY - viewport.y) / viewport.scale,
        };

        setViewport({
          x: centerX - mousePointTo.x * newScale,
          y: centerY - mousePointTo.y * newScale,
          scale: newScale,
        });
      }
      // Reset zoom
      else if (e.key === "0" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setViewport({ x: 0, y: 0, scale: 1 });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Currently no key up handlers needed
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    selectedIds,
    images,
    generationSettings,
    undo,
    redo,
    handleDelete,
    handleDuplicate,
    handleRun,
    croppingImageId,
    viewport,
    canvasSize,
  ]);

  return (
    <div
      className="bg-background text-foreground font-focal relative flex flex-col w-full overflow-hidden h-screen"
      style={{ height: "100dvh" }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Render streaming components for active generations */}
      {Array.from(activeGenerations.entries()).map(([imageId, generation]) => (
        <StreamingImage
          key={imageId}
          imageId={imageId}
          generation={generation}
          apiKey={customApiKey}
          onStreamingUpdate={(id, url) => {
            setImages((prev) =>
              prev.map((img) => (img.id === id ? { ...img, src: url } : img))
            );
          }}
          onComplete={(id, finalUrl) => {
            setImages((prev) =>
              prev.map((img) =>
                img.id === id ? { ...img, src: finalUrl } : img
              )
            );
            setActiveGenerations((prev) => {
              const newMap = new Map(prev);
              newMap.delete(id);
              return newMap;
            });
            setIsGenerating(false);
          }}
          onError={(id, error) => {
            console.error(`Generation error for ${id}:`, error);
            // Remove the failed image
            setImages((prev) => prev.filter((img) => img.id !== id));
            setActiveGenerations((prev) => {
              const newMap = new Map(prev);
              newMap.delete(id);
              return newMap;
            });
            setIsGenerating(false);
            toast({
              title: "Generation failed",
              description: error.toString(),
              variant: "destructive",
            });
          }}
        />
      ))}

      {/* Main content */}
      <main className="flex-1 relative flex items-center justify-center w-full">
        <div className="relative w-full h-full">
          <ContextMenu
            onOpenChange={(open) => {
              if (!open) {
                // Reset isolate state when context menu closes
                setIsolateTarget(null);
                setIsolateInputValue("");
              }
            }}
          >
            <ContextMenuTrigger asChild>
              <div
                className="relative bg-white overflow-hidden w-full h-full touch-none"
                style={{
                  minHeight: `${canvasSize.height}px`,
                  minWidth: `${canvasSize.width}px`,
                }}
              >
                {isCanvasReady && (
                  <Stage
                    ref={stageRef}
                    width={canvasSize.width}
                    height={canvasSize.height}
                    x={viewport.x}
                    y={viewport.y}
                    scaleX={viewport.scale}
                    scaleY={viewport.scale}
                    draggable={false}
                    onDragStart={(e) => {
                      e.evt.preventDefault();
                    }}
                    onDragEnd={(e) => {
                      e.evt.preventDefault();
                    }}
                    onMouseDown={handleMouseDown}
                    onMousemove={handleMouseMove}
                    onMouseup={handleMouseUp}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onContextMenu={(e) => {
                      // Get clicked position
                      const stage = e.target.getStage();
                      if (!stage) return;

                      const point = stage.getPointerPosition();
                      if (!point) return;

                      // Save the context menu position
                      setContextMenuPosition(point);

                      // Convert to canvas coordinates
                      const canvasPoint = {
                        x: (point.x - viewport.x) / viewport.scale,
                        y: (point.y - viewport.y) / viewport.scale,
                      };

                      // Check if we clicked on an image (check in reverse order for top-most image)
                      const clickedImage = [...images].reverse().find((img) => {
                        // Simple bounding box check
                        // TODO: Could be improved to handle rotation
                        return (
                          canvasPoint.x >= img.x &&
                          canvasPoint.x <= img.x + img.width &&
                          canvasPoint.y >= img.y &&
                          canvasPoint.y <= img.y + img.height
                        );
                      });

                      if (clickedImage) {
                        if (!selectedIds.includes(clickedImage.id)) {
                          // If clicking on unselected image, select only that image
                          setSelectedIds([clickedImage.id]);
                        }
                        // If already selected, keep current selection for multi-select context menu
                      }
                    }}
                    onWheel={handleWheel}
                  >
                    <Layer>
                      {/* Grid background */}
                      <Group>
                        {(() => {
                          const gridSize = 50;
                          const gridColor = "#f0f0f0";
                          const lines = [];

                          // Calculate visible area in canvas coordinates
                          const startX =
                            Math.floor(
                              -viewport.x / viewport.scale / gridSize
                            ) * gridSize;
                          const startY =
                            Math.floor(
                              -viewport.y / viewport.scale / gridSize
                            ) * gridSize;
                          const endX =
                            Math.ceil(
                              (canvasSize.width - viewport.x) /
                                viewport.scale /
                                gridSize
                            ) * gridSize;
                          const endY =
                            Math.ceil(
                              (canvasSize.height - viewport.y) /
                                viewport.scale /
                                gridSize
                            ) * gridSize;

                          // Vertical lines
                          for (let x = startX; x <= endX; x += gridSize) {
                            lines.push(
                              <Line
                                key={`v-${x}`}
                                points={[x, startY, x, endY]}
                                stroke={gridColor}
                                strokeWidth={1}
                              />
                            );
                          }

                          // Horizontal lines
                          for (let y = startY; y <= endY; y += gridSize) {
                            lines.push(
                              <Line
                                key={`h-${y}`}
                                points={[startX, y, endX, y]}
                                stroke={gridColor}
                                strokeWidth={1}
                              />
                            );
                          }

                          return lines;
                        })()}
                      </Group>

                      {/* Selection box */}
                      {selectionBox.visible && (
                        <Rect
                          x={Math.min(selectionBox.startX, selectionBox.endX)}
                          y={Math.min(selectionBox.startY, selectionBox.endY)}
                          width={Math.abs(
                            selectionBox.endX - selectionBox.startX
                          )}
                          height={Math.abs(
                            selectionBox.endY - selectionBox.startY
                          )}
                          fill="rgba(59, 130, 246, 0.1)"
                          stroke="rgb(59, 130, 246)"
                          strokeWidth={1}
                          dash={[5, 5]}
                        />
                      )}

                      {/* Render images */}
                      {images
                        .filter((image) => {
                          // Performance optimization: only render visible images
                          const buffer = 100; // pixels buffer
                          const viewBounds = {
                            left: -viewport.x / viewport.scale - buffer,
                            top: -viewport.y / viewport.scale - buffer,
                            right:
                              (canvasSize.width - viewport.x) / viewport.scale +
                              buffer,
                            bottom:
                              (canvasSize.height - viewport.y) /
                                viewport.scale +
                              buffer,
                          };

                          return !(
                            image.x + image.width < viewBounds.left ||
                            image.x > viewBounds.right ||
                            image.y + image.height < viewBounds.top ||
                            image.y > viewBounds.bottom
                          );
                        })
                        .map((image) => (
                          <CanvasImage
                            key={image.id}
                            image={image}
                            isSelected={selectedIds.includes(image.id)}
                            onSelect={(e) => handleSelect(image.id, e)}
                            onChange={(newAttrs) => {
                              setImages((prev) =>
                                prev.map((img) =>
                                  img.id === image.id
                                    ? { ...img, ...newAttrs }
                                    : img
                                )
                              );
                            }}
                            onDoubleClick={() => {
                              setCroppingImageId(image.id);
                            }}
                            onDragStart={() => {
                              // If dragging a selected item in a multi-selection, keep the selection
                              // If dragging an unselected item, select only that item
                              let currentSelectedIds = selectedIds;
                              if (!selectedIds.includes(image.id)) {
                                currentSelectedIds = [image.id];
                                setSelectedIds(currentSelectedIds);
                              }

                              setIsDraggingImage(true);
                              // Save positions of all selected items
                              const positions = new Map<
                                string,
                                { x: number; y: number }
                              >();
                              currentSelectedIds.forEach((id) => {
                                const img = images.find((i) => i.id === id);
                                if (img) {
                                  positions.set(id, { x: img.x, y: img.y });
                                }
                              });
                              setDragStartPositions(positions);
                            }}
                            onDragEnd={() => {
                              setIsDraggingImage(false);
                              saveToHistory();
                              setDragStartPositions(new Map());
                            }}
                            selectedIds={selectedIds}
                            images={images}
                            setImages={setImages}
                            isDraggingImage={isDraggingImage}
                            dragStartPositions={dragStartPositions}
                          />
                        ))}

                      {/* Crop overlay */}
                      {croppingImageId &&
                        (() => {
                          const croppingImage = images.find(
                            (img) => img.id === croppingImageId
                          );
                          if (!croppingImage) return null;

                          return (
                            <CropOverlayWrapper
                              image={croppingImage}
                              onCropChange={(crop) => {
                                setImages((prev) =>
                                  prev.map((img) =>
                                    img.id === croppingImageId
                                      ? { ...img, ...crop }
                                      : img
                                  )
                                );
                              }}
                              onCropEnd={async () => {
                                // Apply crop to image dimensions
                                if (croppingImage) {
                                  const cropWidth =
                                    croppingImage.cropWidth || 1;
                                  const cropHeight =
                                    croppingImage.cropHeight || 1;
                                  const cropX = croppingImage.cropX || 0;
                                  const cropY = croppingImage.cropY || 0;

                                  try {
                                    // Create the cropped image at full resolution
                                    const croppedImageSrc =
                                      await createCroppedImage(
                                        croppingImage.src,
                                        cropX,
                                        cropY,
                                        cropWidth,
                                        cropHeight
                                      );

                                    setImages((prev) =>
                                      prev.map((img) =>
                                        img.id === croppingImageId
                                          ? {
                                              ...img,
                                              // Replace with cropped image
                                              src: croppedImageSrc,
                                              // Update position to the crop area's top-left
                                              x: img.x + cropX * img.width,
                                              y: img.y + cropY * img.height,
                                              // Update dimensions to match crop size
                                              width: cropWidth * img.width,
                                              height: cropHeight * img.height,
                                              // Remove crop values completely
                                              cropX: undefined,
                                              cropY: undefined,
                                              cropWidth: undefined,
                                              cropHeight: undefined,
                                            }
                                          : img
                                      )
                                    );
                                  } catch (error) {
                                    console.error(
                                      "Failed to create cropped image:",
                                      error
                                    );
                                  }
                                }

                                setCroppingImageId(null);
                                saveToHistory();
                              }}
                            />
                          );
                        })()}
                    </Layer>
                  </Stage>
                )}
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                onClick={handleRun}
                disabled={isGenerating || !generationSettings.prompt.trim()}
                className="flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2">
                  {isGenerating ? (
                    <SpinnerIcon className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  <span>Run</span>
                </div>
                <ShortcutBadge
                  variant="alpha"
                  size="xs"
                  shortcut={
                    checkOS("Win") || checkOS("Linux")
                      ? "ctrl+enter"
                      : "meta+enter"
                  }
                />
              </ContextMenuItem>
              <ContextMenuItem
                onClick={handleDuplicate}
                disabled={selectedIds.length === 0}
                className="flex items-center gap-2"
              >
                <Copy className="h-4 w-4" />
                Duplicate
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => {
                  if (selectedIds.length === 1) {
                    setCroppingImageId(selectedIds[0]);
                  }
                }}
                disabled={selectedIds.length !== 1}
                className="flex items-center gap-2"
              >
                <Crop className="h-4 w-4" />
                Crop
              </ContextMenuItem>
              <ContextMenuItem
                onClick={handleRemoveBackground}
                disabled={selectedIds.length === 0}
                className="flex items-center gap-2"
              >
                <Scissors className="h-4 w-4" />
                Remove Background
              </ContextMenuItem>
              <ContextMenuSub>
                <ContextMenuSubTrigger
                  disabled={selectedIds.length !== 1}
                  className="flex items-center gap-2"
                  onMouseEnter={() => {
                    // Reset input value and set target when hovering over the submenu trigger
                    setIsolateInputValue("");
                    if (selectedIds.length === 1) {
                      setIsolateTarget(selectedIds[0]);
                    }
                  }}
                >
                  <Filter className="h-4 w-4" />
                  Isolate Object
                </ContextMenuSubTrigger>
                <ContextMenuSubContent
                  className="w-72 p-3"
                  sideOffset={5}
                  onPointerDownOutside={(e) => e.preventDefault()}
                >
                  <div
                    className="flex flex-col gap-2"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <Label
                      htmlFor="isolate-context-input"
                      className="text-sm font-medium"
                    >
                      What to isolate:
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="isolate-context-input"
                        type="text"
                        placeholder="e.g. car, face, person"
                        value={isolateInputValue}
                        onChange={(e) => setIsolateInputValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            isolateInputValue.trim() &&
                            !isIsolating
                          ) {
                            e.preventDefault();
                            e.stopPropagation();
                            handleIsolate();
                          }
                        }}
                        onFocus={(e) => {
                          // Select all text on focus for easier replacement
                          e.target.select();
                        }}
                        className="flex-1"
                        autoFocus
                        disabled={isIsolating}
                      />
                      <Button
                        type="button"
                        variant="primary"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (isolateInputValue.trim() && !isIsolating) {
                            handleIsolate();
                          }
                        }}
                        disabled={!isolateInputValue.trim() || isIsolating}
                      >
                        {isIsolating ? (
                          <>
                            <SpinnerIcon className="h-4 w-4 animate-spin mr-1" />
                            Processing...
                          </>
                        ) : (
                          "Enter"
                        )}
                      </Button>
                    </div>
                  </div>
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuItem
                onClick={handleCombineImages}
                disabled={selectedIds.length < 2}
                className="flex items-center gap-2"
              >
                <Combine className="h-4 w-4" />
                Combine Images
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => {
                  selectedIds.forEach((id) => {
                    const image = images.find((img) => img.id === id);
                    if (image) {
                      const link = document.createElement("a");
                      link.download = `image-${Date.now()}.png`;
                      link.href = image.src;
                      link.click();
                    }
                  });
                }}
                disabled={selectedIds.length === 0}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Download
              </ContextMenuItem>
              <ContextMenuItem
                onClick={handleDelete}
                disabled={selectedIds.length === 0}
                className="flex items-center gap-2 text-destructive"
              >
                <X className="h-4 w-4" />
                Delete
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>

          <div className="absolute top-4 left-4 z-20 flex flex-col items-start gap-2">
            {/* Fal logo */}
            <div className="border bg-background/80 p-2 flex flex-row rounded gap-2 items-center">
              <Link
                href="https://fal.ai"
                target="_blank"
                className="block hover:opacity-80 transition-opacity"
              >
                <Logo className="h-8 w-16 text-foreground" />
              </Link>
            </div>

            {/* Mobile tool icons - animated based on selection */}
            <div
              className={cn(
                "flex items-center flex-col gap-1 md:hidden bg-background/80 border rounded p-1",
                "transition-transform duration-300 ease-in-out",
                selectedIds.length > 0
                  ? "translate-x-0"
                  : "-translate-x-[calc(100%+1rem)]"
              )}
            >
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRun}
                disabled={isGenerating || !generationSettings.prompt.trim()}
                className="w-12 h-12 p-0"
                title="Run"
              >
                {isGenerating ? (
                  <SpinnerIcon className="h-12 w-12 animate-spin" />
                ) : (
                  <Play className="h-12 w-12" />
                )}
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={handleDuplicate}
                disabled={selectedIds.length === 0}
                className="w-12 h-12 p-0"
                title="Duplicate"
              >
                <Copy className="h-12 w-12" />
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (selectedIds.length === 1) {
                    setCroppingImageId(selectedIds[0]);
                  }
                }}
                disabled={selectedIds.length !== 1}
                className="w-12 h-12 p-0"
                title="Crop"
              >
                <Crop className="h-12 w-12" />
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={handleRemoveBackground}
                disabled={selectedIds.length === 0}
                className="w-12 h-12 p-0"
                title="Remove Background"
              >
                <Scissors className="h-12 w-12" />
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={handleCombineImages}
                disabled={selectedIds.length < 2}
                className="w-12 h-12 p-0"
                title="Combine Images"
              >
                <Combine className="h-12 w-12" />
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  selectedIds.forEach((id) => {
                    const image = images.find((img) => img.id === id);
                    if (image) {
                      const link = document.createElement("a");
                      link.download = `image-${Date.now()}.png`;
                      link.href = image.src;
                      link.click();
                    }
                  });
                }}
                disabled={selectedIds.length === 0}
                className="w-12 h-12 p-0"
                title="Download"
              >
                <Download className="h-12 w-12" />
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={handleDelete}
                disabled={selectedIds.length === 0}
                className="w-12 h-12 p-0 text-destructive hover:text-destructive"
                title="Delete"
              >
                <Trash2 className="h-12 w-12" />
              </Button>
            </div>
          </div>

          <div className="fixed bottom-0 left-0 right-0 md:absolute md:bottom-4 md:left-1/2 md:transform md:-translate-x-1/2 z-20 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:p-0 md:pb-0 md:max-w-[600px]">
            <div className="bg-card/95 backdrop-blur-sm border border-border rounded shadow">
              <div className="flex flex-col gap-3 px-3 md:px-6 py-2 md:py-3 relative">
                {/* Active generations indicator */}
                {activeGenerations.size > 0 && (
                  <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 px-3 py-1 rounded text-sm font-medium flex items-center gap-2 ">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full animate-ping" />
                    <span>
                      Generating {activeGenerations.size} image
                      {activeGenerations.size > 1 ? "s" : ""}
                    </span>
                  </div>
                )}

                {/* Action buttons row */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={undo}
                    disabled={historyIndex <= 0}
                    className="h-8 w-8 p-0"
                    title="Undo"
                  >
                    <Undo className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={redo}
                    disabled={historyIndex >= history.length - 1}
                    className="h-8 w-8 p-0"
                    title="Redo"
                  >
                    <Redo className="h-4 w-4" />
                  </Button>
                  <div className="flex-1" />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsApiKeyDialogOpen(true)}
                    className={cn(
                      "h-8 px-3 gap-2",
                      customApiKey &&
                        "border-green-500/50 bg-green-500/10 hover:border-green-500/70 hover:bg-green-500/20"
                    )}
                    title={
                      customApiKey
                        ? "Using custom API key"
                        : "Add your FAL API key"
                    }
                  >
                    <Key
                      className={cn(
                        "h-4 w-4",
                        customApiKey && "text-green-500"
                      )}
                    />
                    <span
                      className={cn(
                        "text-sm",
                        customApiKey && "text-green-500"
                      )}
                    >
                      {customApiKey ? "Custom Key" : "API Key"}
                    </span>
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/*";
                      input.multiple = true;
                      input.onchange = (e) =>
                        handleFileUpload((e.target as HTMLInputElement).files);
                      input.click();
                    }}
                    className="h-8 px-3 gap-2"
                    title="Upload images"
                  >
                    <Upload className="h-4 w-4" />
                    <span className="text-sm">Upload</span>
                  </Button>
                </div>

                <div className="relative">
                  <Textarea
                    value={generationSettings.prompt}
                    onChange={(e) =>
                      setGenerationSettings({
                        ...generationSettings,
                        prompt: e.target.value,
                      })
                    }
                    placeholder={`Enter a prompt... (${checkOS("Win") || checkOS("Linux") ? "Ctrl" : "⌘"}+Enter to run)`}
                    className="w-full h-20 resize-none bg-background/50 pr-36"
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                        e.preventDefault();
                        if (!isGenerating && generationSettings.prompt.trim()) {
                          handleRun();
                        }
                      }
                    }}
                  />

                  {selectedIds.length > 0 && (
                    <div className="absolute top-1 right-2 flex items-center justify-end">
                      <div className="relative h-12 w-20">
                        {selectedIds.slice(0, 3).map((id, index) => {
                          const image = images.find((img) => img.id === id);
                          if (!image) return null;

                          const isLast =
                            index === Math.min(selectedIds.length - 1, 2);
                          const offset = index * 8;
                          // Make each card progressively smaller
                          const size = 40 - index * 4;
                          const topOffset = index * 2; // Offset from top to maintain visual alignment

                          return (
                            <div
                              key={id}
                              className="absolute rounded border bg-background overflow-hidden"
                              style={{
                                right: `${offset}px`,
                                top: `${topOffset}px`,
                                zIndex: 3 - index,
                                width: `${size}px`,
                                height: `${size}px`,
                              }}
                            >
                              <img
                                src={image.src}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                              {/* Show count on last visible card if more than 3 selected */}
                              {isLast && selectedIds.length > 3 && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                  <span className="text-white text-xs font-medium">
                                    +{selectedIds.length - 3}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Mode indicator badge */}
                  <div className="absolute bottom-2 right-2 text-[10px] font-medium pointer-events-none">
                    {selectedIds.length > 0 ? (
                      <div className="flex items-center gap-1.5 bg-blue-500/10 text-blue-600 px-2 py-1 rounded-sm border border-blue-500/20">
                        <ImageIcon className="w-3 h-3" />
                        <span>Image to Image</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 bg-orange-500/10 text-orange-600 px-2 py-1 rounded-sm border border-orange-500/20">
                        <span className="font-bold">T</span>
                        <span>Text to Image</span>
                      </div>
                    )}
                  </div>
                </div>

                {generationSettings.styleId === "custom" && (
                  <Input
                    value={generationSettings.loraUrl}
                    onChange={(e) =>
                      setGenerationSettings({
                        ...generationSettings,
                        loraUrl: e.target.value,
                      })
                    }
                    placeholder="Kontext LoRA URL (optional)"
                    className="w-full bg-background/50"
                  />
                )}

                {/* Style dropdown and Run button */}
                <div className="flex items-center gap-3">
                  {/* Left side - Style selector button */}
                  <Button
                    variant="secondary"
                    className="flex items-center gap-2"
                    onClick={() => setIsStyleDialogOpen(true)}
                  >
                    {(() => {
                      if (generationSettings.styleId === "custom") {
                        return (
                          <>
                            <div className="w-5 h-5 rounded flex items-center justify-center">
                              <Plus className="h-3 w-3" />
                            </div>
                            <span className="text-sm">Custom</span>
                          </>
                        );
                      }
                      const selectedModel =
                        styleModels.find(
                          (m) => m.id === generationSettings.styleId
                        ) || styleModels.find((m) => m.id === "simpsons");
                      return (
                        <>
                          <img
                            src={selectedModel?.imageSrc}
                            alt={selectedModel?.name}
                            className="w-5 h-5 rounded object-cover"
                          />
                          <span className="text-sm">
                            {selectedModel?.name || "Simpsons Style"}
                          </span>
                        </>
                      );
                    })()}
                    <ChevronDown className="h-4 w-4" />
                  </Button>

                  {/* Right side - Run button */}
                  <Button
                    onClick={handleRun}
                    variant="primary"
                    disabled={isGenerating || !generationSettings.prompt.trim()}
                    className="gap-2 font-medium transition-all"
                  >
                    {isGenerating ? (
                      <>
                        <SpinnerIcon className="h-4 w-4 animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span>Run</span>
                        <ShortcutBadge
                          variant="alpha"
                          size="xs"
                          shortcut={
                            checkOS("Win") || checkOS("Linux")
                              ? "ctrl+enter"
                              : "meta+enter"
                          }
                        />
                      </div>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Mini-map */}
          {images.length > 0 && (
            <div className="absolute top-4 right-2 md:right-4 z-20 bg-background/95 border rounded shadow-sm p-1 md:p-2">
              <div className="relative w-32 h-24 md:w-48 md:h-32 bg-muted rounded overflow-hidden">
                {/* Calculate bounds of all content */}
                {(() => {
                  let minX = Infinity,
                    minY = Infinity;
                  let maxX = -Infinity,
                    maxY = -Infinity;

                  images.forEach((img) => {
                    minX = Math.min(minX, img.x);
                    minY = Math.min(minY, img.y);
                    maxX = Math.max(maxX, img.x + img.width);
                    maxY = Math.max(maxY, img.y + img.height);
                  });

                  const contentWidth = maxX - minX;
                  const contentHeight = maxY - minY;
                  const miniMapWidth = 192; // 48 * 4 (w-48 in tailwind)
                  const miniMapHeight = 128; // 32 * 4 (h-32 in tailwind)

                  // Calculate scale to fit content in minimap
                  const scaleX = miniMapWidth / contentWidth;
                  const scaleY = miniMapHeight / contentHeight;
                  const scale = Math.min(scaleX, scaleY) * 0.9; // 90% to add padding

                  // Center content in minimap
                  const offsetX = (miniMapWidth - contentWidth * scale) / 2;
                  const offsetY = (miniMapHeight - contentHeight * scale) / 2;

                  return (
                    <>
                      {/* Render tiny versions of images */}
                      {images.map((img) => (
                        <div
                          key={img.id}
                          className="absolute bg-primary/50"
                          style={{
                            left: `${(img.x - minX) * scale + offsetX}px`,
                            top: `${(img.y - minY) * scale + offsetY}px`,
                            width: `${img.width * scale}px`,
                            height: `${img.height * scale}px`,
                          }}
                        />
                      ))}

                      {/* Viewport indicator */}
                      <div
                        className="absolute border-2 border-blue-500 bg-blue-500/10"
                        style={{
                          left: `${(-viewport.x / viewport.scale - minX) * scale + offsetX}px`,
                          top: `${(-viewport.y / viewport.scale - minY) * scale + offsetY}px`,
                          width: `${(canvasSize.width / viewport.scale) * scale}px`,
                          height: `${(canvasSize.height / viewport.scale) * scale}px`,
                        }}
                      />
                    </>
                  );
                })()}
              </div>
              <p className="text-xs text-muted-foreground mt-1 text-center">
                Mini-map
              </p>
            </div>
          )}

          {/* Zoom controls */}
          <div className="absolute bottom-4 right-4 flex-col hidden md:flex items-end gap-2 z-20">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const newScale = Math.min(5, viewport.scale * 1.2);
                const centerX = canvasSize.width / 2;
                const centerY = canvasSize.height / 2;

                // Zoom towards center
                const mousePointTo = {
                  x: (centerX - viewport.x) / viewport.scale,
                  y: (centerY - viewport.y) / viewport.scale,
                };

                setViewport({
                  x: centerX - mousePointTo.x * newScale,
                  y: centerY - mousePointTo.y * newScale,
                  scale: newScale,
                });
              }}
              className="w-10 h-10 p-0"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const newScale = Math.max(0.1, viewport.scale / 1.2);
                const centerX = canvasSize.width / 2;
                const centerY = canvasSize.height / 2;

                // Zoom towards center
                const mousePointTo = {
                  x: (centerX - viewport.x) / viewport.scale,
                  y: (centerY - viewport.y) / viewport.scale,
                };

                setViewport({
                  x: centerX - mousePointTo.x * newScale,
                  y: centerY - mousePointTo.y * newScale,
                  scale: newScale,
                });
              }}
              className="w-10 h-10 p-0"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setViewport({ x: 0, y: 0, scale: 1 });
              }}
              className="w-10 h-10 p-0"
              title="Reset view"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <div className="border text-xs text-muted-foreground text-center bg-background/80 px-2 py-1 rounded">
              {Math.round(viewport.scale * 100)}%
            </div>
            <div className="border bg-background/80 p-2 flex flex-row rounded gap-2 items-center">
              <Link href="https://fal.ai" target="_blank">
                <LogoIcon className="w-10 h-10" />
              </Link>
              <div className="text-center text-xs">
                Powered by <br />
                <Link href="https://fal.ai" target="_blank">
                  <span className="font-bold text-xl">Fal</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Style Selection Dialog */}
      <Dialog open={isStyleDialogOpen} onOpenChange={setIsStyleDialogOpen}>
        <DialogContent className="w-[95vw] max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Choose a Style</DialogTitle>
            <DialogDescription>
              Select a style to apply to your images or choose Custom to use
              your own LoRA
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            {/* Fixed gradient overlays outside scrollable area */}
            <div className="pointer-events-none absolute -top-[1px] left-0 right-0 z-30 h-4 md:h-12 bg-gradient-to-b from-background via-background/90 to-transparent" />
            <div className="pointer-events-none absolute -bottom-[1px] left-0 right-0 z-30 h-4 md:h-12 bg-gradient-to-t from-background via-background/90 to-transparent" />

            {/* Scrollable content container */}
            <div className="overflow-y-auto max-h-[60vh] px-1">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pt-4 pb-6 md:pt-8 md:pb-12">
                {/* Custom option */}
                <button
                  onClick={() => {
                    setGenerationSettings({
                      ...generationSettings,
                      loraUrl: "",
                      prompt: "",
                      styleId: "custom",
                    });
                    setIsStyleDialogOpen(false);
                  }}
                  className={cn(
                    "group relative flex flex-col items-center gap-2 p-3 rounded border",
                    generationSettings.styleId === "custom"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <div className="w-full aspect-square rounded-md bg-muted flex items-center justify-center">
                    <Plus className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-medium">Custom</span>
                </button>

                {/* Predefined styles */}
                {styleModels.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      setGenerationSettings({
                        ...generationSettings,
                        loraUrl: model.loraUrl || "",
                        prompt: model.prompt,
                        styleId: model.id,
                      });
                      setIsStyleDialogOpen(false);
                    }}
                    className={cn(
                      "group relative flex flex-col items-center gap-2 p-3 rounded border",
                      generationSettings.styleId === model.id
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <div className="relative w-full aspect-square rounded-md overflow-hidden">
                      <img
                        src={model.imageSrc}
                        alt={model.name}
                        className="w-full h-full object-cover"
                      />
                      {generationSettings.styleId === model.id && (
                        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center"></div>
                      )}
                    </div>
                    <span className="text-sm font-medium text-center">
                      {model.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* API Key Dialog */}
      <Dialog open={isApiKeyDialogOpen} onOpenChange={setIsApiKeyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>FAL API Key</DialogTitle>
            <DialogDescription>
              Add your own FAL API key to bypass rate limits and use your own
              quota.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <Input
                id="api-key"
                type="password"
                placeholder="Enter your API key"
                value={tempApiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Get your API key from{" "}
                <Link
                  href="https://fal.ai/dashboard/keys"
                  target="_blank"
                  className="underline hover:text-foreground"
                >
                  fal.ai/dashboard/keys
                </Link>
              </p>
            </div>

            {customApiKey && (
              <div className="rounded-md bg-green-500/10 border border-green-500/20 p-3">
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <Check className="h-4 w-4" />
                  <span>Currently using custom API key</span>
                </div>
              </div>
            )}

            <div className="flex justify-between gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setCustomApiKey("");
                  setTempApiKey("");
                  setIsApiKeyDialogOpen(false);
                  toast({
                    title: "API key removed",
                    description: "Using default rate-limited API",
                  });
                }}
                disabled={!customApiKey}
              >
                Remove Key
              </Button>

              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setTempApiKey(customApiKey);
                    setIsApiKeyDialogOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    const trimmedKey = tempApiKey.trim();
                    if (trimmedKey) {
                      setCustomApiKey(trimmedKey);
                      setIsApiKeyDialogOpen(false);
                      toast({
                        title: "API key saved",
                        description: "Your custom API key is now active",
                      });
                    } else if (trimmedKey) {
                      toast({
                        title: "Invalid API key",
                        description: "FAL API keys should start with 'fal_'",
                        variant: "destructive",
                      });
                    }
                  }}
                  disabled={!tempApiKey.trim()}
                >
                  Save Key
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
