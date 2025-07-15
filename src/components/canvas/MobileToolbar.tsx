import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Play,
  Copy,
  Crop,
  Scissors,
  Combine,
  Download,
  Trash2,
} from "lucide-react";
import { SpinnerIcon } from "@/components/icons";
import type { PlacedImage, GenerationSettings } from "@/types/canvas";

interface MobileToolbarProps {
  selectedIds: string[];
  images: PlacedImage[];
  isGenerating: boolean;
  generationSettings: GenerationSettings;
  handleRun: () => void;
  handleDuplicate: () => void;
  handleRemoveBackground: () => void;
  handleCombineImages: () => void;
  handleDelete: () => void;
  setCroppingImageId: (id: string | null) => void;
}

export const MobileToolbar: React.FC<MobileToolbarProps> = ({
  selectedIds,
  images,
  isGenerating,
  generationSettings,
  handleRun,
  handleDuplicate,
  handleRemoveBackground,
  handleCombineImages,
  handleDelete,
  setCroppingImageId,
}) => {
  return (
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
  );
};