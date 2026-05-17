import { Component, ElementRef, ViewChild } from '@angular/core';

import { getStroke, Vec2 } from 'perfect-freehand';

import { DrawingStroke } from '../models/drawing.model';
import { IframeMessageType } from '../models/drawing.model';

import { QlIframeMessageService } from '../services/QlIframeMessageService';
import { EASINGS } from '../utils/easingMethods';

import { captureSvgAsBase64 } from '../utils/captureSvgAsBase64';
import { saveSVG } from '../utils/saveSvg';
import { parseSVGFile } from '../utils/parseSvgFile';
import { importFromBase64 } from '../utils/importFromBase64';
import {
  getDefaultTool,
  getDefaultToolPen1,
  getDefaultToolPen2,
  getDefaultToolHighlighter,
} from '../utils/getDefaultTool';

import { getSvgPathFromStroke } from '../utils/getSvgPathFromStroke';

@Component({
  selector: 'app-drawing',
  templateUrl: './drawing.component.html',
  styleUrls: ['./drawing.component.css'],
})
export class DrawingComponent {
  @ViewChild('svgElement') svgElement!: ElementRef<SVGElement>;

  allStrokes: DrawingStroke[] = [];
  redoStack: DrawingStroke[] = [];
  activeTool: 'pen1' | 'pen2' | 'highlighter' | 'eraser' = 'pen1';

  currentPoints: number[][] = [];
  previewPath: string = '';

  easingOptions = Object.keys(EASINGS).map((key) => ({
    label: key,
    value: key,
  }));

  toolOptions: Array<{
    key: 'pen1' | 'pen2' | 'highlighter' | 'eraser';
    label: string;
    icon: string;
    accent: string;
    description: string;
  }> = [
    {
      key: 'pen1',
      label: 'Pen 1',
      icon: 'assets/pen1.svg',
      accent: '#0B72E7',
      description: 'Smooth digital ink',
    },
    {
      key: 'pen2',
      label: 'Pen 2',
      icon: 'assets/pen2.svg',
      accent: '#3B82F6',
      description: 'Sharper blue stroke',
    },
    {
      key: 'highlighter',
      label: 'Highlighter',
      icon: 'assets/pen3.svg',
      accent: '#7C3AED',
      description: 'Soft translucent marker',
    },
    {
      key: 'eraser',
      label: 'Eraser',
      icon: 'assets/eraser.svg',
      accent: '#ff7a93',
      description: 'Clean stroke removal',
    },
  ];

  utilityActions = [
    { icon: 'pi pi-upload', label: 'Upload', action: () => this.triggerUpload() },
    { icon: 'pi pi-download', label: 'Export', action: () => this.saveSVG() },
    { icon: 'pi pi-undo', label: 'Undo', action: () => this.undo(), disabled: () => this.allStrokes.length === 0 },
    { icon: 'pi pi-refresh', label: 'Redo', action: () => this.redo(), disabled: () => this.redoStack.length === 0 },
    { icon: 'pi pi-trash', label: 'Clear', action: () => this.clearCanvas() },
    { icon: 'pi pi-send', label: 'Send', action: () => this.sendToProject() },
  ];

  tools: any = {
    pen1: getDefaultToolPen1('#0B72E7', 14),
    pen2: getDefaultToolPen2('#2563eb', 16),
    highlighter: getDefaultToolHighlighter('#7dd3fc', 26, 0.22),
    eraser: { size: 40 },
  };

  // ----------handling window events to get the data from the parent app :

  ngOnInit() {
    window.addEventListener('message', this.handleParentMessage.bind(this));
  }

  ngOnDestroy() {
    window.removeEventListener('message', this.handleParentMessage.bind(this));
  }

  handleParentMessage(event: MessageEvent) {
    // Security: It is highly recommended to check the origin
    // if (event.origin !== 'https://your-parent-app.com') return;

    const data = event.data;

    // Check if the message type matches what your parent sends
    if (data.message === 'edit-layout-object') {
      this.importFromBase64(data.payload);
    }
  }

  private importFromBase64(base64String: string) {
    // Clear current canvas before loading new data and then importing the svg
    importFromBase64(base64String, this.clearCanvas);
  }

  // ------------------- UTILITIES -----------------
  showToolPanel = false;

  selectTool(tool: 'pen1' | 'pen2' | 'highlighter' | 'eraser') {
    if (this.activeTool === tool && this.showToolPanel) {
      this.showToolPanel = false;
      return;
    }

    this.activeTool = tool;
    this.showToolPanel = true;
  }

  closeToolPanel() {
    this.showToolPanel = false;
  }

  get activeToolMeta() {
    return this.toolOptions.find((tool) => tool.key === this.activeTool);
  }

  get showContextNavbar() {
    return this.showToolPanel && !!this.activeToolMeta;
  }

  get displayToolLabel() {
    return this.activeTool === 'highlighter' ? 'Pen' : this.activeToolMeta?.label;
  }

  resetPenSettings() {
    if (this.activeTool === 'eraser') return;
    const defaults = {
      pen1: { color: '#0B72E7', size: 14 },
      pen2: { color: '#2563eb', size: 16 },
      highlighter: { color: '#7dd3fc', size: 26, opacity: 0.22 },
    };
    const d = (defaults as any)[this.activeTool];
    this.tools[this.activeTool] = getDefaultTool(
      d.color,
      d.size,
      d.opacity || 1,
    );
  }

  undo() {
    const s = this.allStrokes.pop();
    if (s) this.redoStack.push(s);
  }

  redo() {
    const s = this.redoStack.pop();
    if (s) this.allStrokes.push(s);
  }

  clearCanvas() {
    this.allStrokes = [];
    this.redoStack = [];
  }

  // --------------- FILE I/O -----------------------

  onFileDrop(event: DragEvent) {
    event.preventDefault();
    if (
      event.dataTransfer &&
      event.dataTransfer.files &&
      event.dataTransfer.files.length > 0
    ) {
      this.parseSVGFile(event.dataTransfer.files[0]);
    }
  }

  triggerUpload() {
    const fileInput = document.getElementById('svgUpload') as HTMLInputElement;
    fileInput.click();
  }

  handleFileUpload(event: any) {
    const file = event.target.files[0];
    if (file) this.parseSVGFile(file);
  }

  parseSVGFile(file: File) {
    parseSVGFile(file).then((strokes) => {
      this.allStrokes = strokes;
    });
  }

  // -----------------Save File ------------------------------

  saveSVG() {
    const svgEl = this.svgElement.nativeElement;
    saveSVG(svgEl);
  }

  // -------------- DRAWING CORE ------------------------------

  private getLibOptions() {
    const t = this.tools[this.activeTool];
    return {
      size: t.size,
      thinning: t.thinning,
      streamline: t.streamline,
      smoothing: t.smoothing,
      easing: EASINGS[t.easing],
      start: {
        taper: t.start.taper,
        easing: EASINGS[t.start.easing],
        cap: true,
      },
      end: { taper: t.end.taper, easing: EASINGS[t.end.easing], cap: true },
    };
  }

  // ------------------Control Methods------------------

  onPointerDown(e: PointerEvent) {
    if (!this.activeTool) return;
    if (this.activeTool === 'eraser') {
      this.erase(e);
      return;
    }
    const { x, y } = this.getCoords(e);
    this.currentPoints = [[x, y, e.pressure]];
    this.redoStack = [];
  }

  getStrokeTwoPointArrayData!: Vec2[];

  onPointerMove(e: PointerEvent) {
    if (e.buttons !== 1) return;
    if (!this.activeTool) return;
    if (this.activeTool === 'eraser') {
      this.erase(e);
      return;
    }
    const { x, y } = this.getCoords(e);
    this.currentPoints = [...this.currentPoints, [x, y, e.pressure]];
    ((this.getStrokeTwoPointArrayData = getStroke(this.currentPoints, this.getLibOptions())),
      (this.previewPath = this.getSvgPathFromStroke(this.getStrokeTwoPointArrayData)));
  }

  metaSvgPathString = '';

  private getSvgPathFromStroke(stroke: number[][]): string {
    this.metaSvgPathString = getSvgPathFromStroke(stroke);
    return this.metaSvgPathString;
  }

  onPointerUp() {
    if (this.currentPoints.length > 0 && this.activeTool !== 'eraser') {
      const t = this.tools[this.activeTool];
      this.allStrokes.push({
        points: [...this.currentPoints],
        path: this.previewPath,
        color: t.color,
        opacity: t.opacity,
        outlineColor: t.outline.color,
        outlineWidth: t.outline.width,
      });
    }
    this.currentPoints = [];
    this.previewPath = '';
  }

  private erase(e: PointerEvent) {
    const { x, y } = this.getCoords(e);
    this.allStrokes = this.allStrokes.filter(
      (s) =>
        !s.points.some(
          (p) => Math.hypot(p[0] - x, p[1] - y) < this.tools.eraser.size,
        ),
    );
  }

  private getCoords(e: PointerEvent) {
    const rect = this.svgElement.nativeElement.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // ------- send to parent method ---------------------------

  currentSvgBase64: string = '';

  sendAddObject(
    dataString: string,
    type: 'imagebox' | 'stickerbox' | 'textbox' | 'svg',
    metaData?: Record<string, any>,
    targetOrigin: string = '*',
  ) {
    QlIframeMessageService.sendMessageToParent(
      {
        type: IframeMessageType.ADD_OBJECT,
        payload: {
          dataString,
          type,
          metaData,
        },
      },
      targetOrigin,
    );
  }

  sendToProject() {
    const svgEl = this.svgElement.nativeElement;
    //capturing the svg and converting to base64 string
    this.currentSvgBase64 = captureSvgAsBase64(svgEl);
    this.sendAddObject(this.currentSvgBase64, 'stickerbox', {
      svgPathString: this.metaSvgPathString, // it is reduced svg string from the getSvgFromStroke method.
      getStrokeTwoPointArrayData: this.getStrokeTwoPointArrayData, // this is two point 2d array which defined by the getStroke() method 
      // of the perfect free hand package.
    });
  }
}
