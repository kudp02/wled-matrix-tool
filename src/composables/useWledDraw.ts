import { ref, computed, watch, onMounted } from "vue";

// Clear type definitions for history actions
interface DrawAction {
  type: "draw";
  index: number;
  color: string; // The previous color before change
}

interface ClearAction {
  type: "clear";
  pixels: string[]; // The previous state of all pixels
}

type HistoryAction = DrawAction | ClearAction;

export function useWledDraw() {
  // ===== STATE VARIABLES =====
  const apiUrl = ref(""); // WLED API endpoint URL
  const wledUrl = ref(""); // Base WLED interface URL
  const cellSize = ref(10); // Size of each pixel cell in the drawing grid
  const gridWidth = ref(14); // Matrix width (in pixels)
  const gridHeight = ref(20); // Matrix height (in pixels)
  const flipHorizontal = ref(false); // Matrix flipped horizontally
  const flipVertical = ref(false); // Matrix flipped vertically
  const pixelData = ref<string[]>([]); // Holds color values for each pixel
  const currentColor = ref("#ff2500"); // Currently selected drawing color
  const isInitializing = ref(true);

  // Default color palette
  const colorPalette = ref([
    "#ff2500", // Red
    "#ff9305", // Orange
    "#fdfc00", // Yellow
    "#20f80f", // Green
    "#0533ff", // Blue
    "#ffffff", // White
    "#929292", // Gray
    "#000000", // Black
  ]);

  // ===== APPLICATION STATE =====
  const loading = ref(true); // Loading status
  const error = ref(false); // Error status
  const ignoreApi = ref(false); // Flag to continue without API connection

  // ===== HISTORY TRACKING FOR UNDO =====
  const history = ref<HistoryAction[]>([]);
  const maxHistoryLength = 50; // Limit history size to avoid memory issues

  // ===== DEBOUNCE FUNCTIONALITY =====
  const debounceDelay = ref(100); // Debounce delay in milliseconds (default 100ms)
  let debounceTimer: number | null = null; // Timer for debouncing
  const isUpdatePending = ref(false); // Flag to track pending updates
  const pixelDataChanged = ref(false); // Flag to track if pixel data has changed

  // ===== COMPUTED VALUES FOR WLED API =====
  // Format JSON payload for sending to WLED API
  const wledJson = computed(() => {
    return `{"on": true,"bri": 230, "v": true, "seg": {"i":[${formattedColors.value}]}}`;
  });

  // Format pixel colors for WLED API (removes # from hex codes)
  const formattedColors = computed(() => {
    return pixelData.value
      .map((color) => `"${color || "#000000"}"`)
      .join(",")
      .replaceAll("#", "");
  });

  // ===== CORE METHODS =====

  // Save an action to history for undo functionality
  function saveToHistory(action: HistoryAction): void {
    // Add action to history
    history.value.push(action);

    // Keep history within size limit
    if (history.value.length > maxHistoryLength) {
      history.value.shift();
    }

    // Save history to localStorage
    try {
      localStorage.drawHistory = JSON.stringify(history.value);
    } catch (e) {
      console.error("Failed to save history to localStorage:", e);
    }
  }

  // Undo the last action (draw or clear)
  function undo(): void {
    if (history.value.length === 0) return;

    const lastAction = history.value.pop();

    if (lastAction?.type === "draw") {
      // Restore a single pixel
      const { index, color } = lastAction;
      pixelData.value[index] = color;
    } else if (lastAction?.type === "clear") {
      // Restore the entire grid
      pixelData.value = [...lastAction.pixels];
    }

    // Save updated history to localStorage
    try {
      localStorage.drawHistory = JSON.stringify(history.value);
    } catch (e) {
      console.error("Failed to save history to localStorage:", e);
    }

    // Save pixel data and update WLED
    saveToLocalStorage();
    pixelDataChanged.value = true;
    debouncedSendToWled();
  }

  // Clear the screen (set all pixels to black)
  function clearScreen(): void {
    // Save current state to history for undo
    saveToHistory({
      type: "clear",
      pixels: [...pixelData.value],
    });

    // Clear grid by setting all pixels to black
    pixelData.value = Array(gridWidth.value * gridHeight.value).fill("#000000");

    // Save to localStorage and update WLED
    saveToLocalStorage();
    pixelDataChanged.value = true;
    debouncedSendToWled();
  }

  // Initialize or reset the drawing grid
  function setupGrid(): void {
    const gridSize = gridWidth.value * gridHeight.value;

    // Prepare new pixel data array
    const newPixelData: string[] = [];

    // Only try to load from localStorage if we're not initializing
    let localData: string[] = [];
    if (localStorage.pixelData) {
      try {
        localData = localStorage.pixelData.split(",");
        console.log(`Loaded ${localData.length} pixels from localStorage`);
      } catch (e) {
        console.error("Error loading from localStorage:", e);
      }
    }

    // Fill the grid with data from localStorage or default to black
    // Make sure we handle mismatched array lengths
    for (let i = 0; i < gridSize; i++) {
      newPixelData.push(i < localData.length ? localData[i] : "#000000");
    }

    // Set the pixel data all at once
    pixelData.value = newPixelData;

    // Load history from localStorage
    loadHistoryFromStorage();
  }

  // Update a single pixel with a new color
  function updatePixel(index: number, newColor: string): void {
    // Don't add to history if the color is the same
    if (pixelData.value[index] === newColor) return;

    // Save the old color to history for undo before changing the pixel
    saveToHistory({
      type: "draw",
      index,
      color: pixelData.value[index],
    });

    // Update the pixel
    pixelData.value[index] = newColor;
    pixelDataChanged.value = true;

    // Save to localStorage
    saveToLocalStorage();
  }

  // Immediate send to WLED (without debounce)
  function sendToWledImmediate(): void {
    if (ignoreApi.value) return;

    const payload = buildWledPayload()

    fetch(apiUrl.value, {
      method: "POST",
      body: payload,
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    })
      .then((response) => response.json())
      .then(() => {
        // Success - reset flags
        pixelDataChanged.value = false;
      })
      .catch((error) => {
        console.error("WLED API Error:", error);
        error.value = true;
      });
  }

  function buildWledPayload(): string {
    let data = pixelData.value

    if(flipHorizontal.value){
        data = flipHorizontalRaw(data, gridWidth.value, gridHeight.value)
    }

    if(flipVertical.value){
        data = flipVerticalRaw(data, gridWidth.value, gridHeight.value)
    }

    const colors = data
      .map(c => `"${(c || "#000000").replace("#", "")}"`)
      .join(',')

    return `{
      "on": true,
      "bri": 230,
      "v": true,
      "seg": { "i": [${colors}] }
    }`
  }

  function flipHorizontalRaw(data: string[], width: number, height: number) {
    const result: string[] = []

    for (let y = 0; y < height; y++) {
      const rowStart = y * width
      const row = data.slice(rowStart, rowStart + width).reverse()
      result.push(...row)
    }

    return result
  }

  function flipVerticalRaw(data: string[], width: number, height: number) {
    const result: string[] = []

    for (let y = height - 1; y >= 0; y--) {
      const rowStart = y * width
      result.push(...data.slice(rowStart, rowStart + width))
    }

    return result
  }

  // Enhanced debounced version of sendToWled
  function debouncedSendToWled(forceImmediate: boolean = false): void {
    if (ignoreApi.value) return;

    // Set the change flag to ensure we send an update
    pixelDataChanged.value = true;

    // If force immediate is true, send right away
    if (forceImmediate) {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }

      sendToWledImmediate();
      return;
    }

    // If there's already a timer running, don't set a new one
    if (debounceTimer !== null) {
      return;
    }

    // Start a new timer
    debounceTimer = window.setTimeout(() => {
      // Only send if there are actual changes to send
      if (pixelDataChanged.value) {
        // Mark that we're processing this update
        isUpdatePending.value = true;

        // Use requestAnimationFrame to sync with the browser's render cycle
        requestAnimationFrame(() => {
          sendToWledImmediate();
          isUpdatePending.value = false;
          debounceTimer = null;
        });
      } else {
        // Reset the timer if no changes
        debounceTimer = null;
      }
    }, debounceDelay.value);
  }

  // Batch update multiple pixels at once
  function batchUpdatePixels(indices: number[], newColor: string): void {
    // Update each pixel
    indices.forEach((index) => {
      if (
        index >= 0 &&
        index < pixelData.value.length &&
        pixelData.value[index] !== newColor
      ) {
        // Save to history individually for proper undo
        saveToHistory({
          type: "draw",
          index,
          color: pixelData.value[index],
        });

        // Update the pixel
        pixelData.value[index] = newColor;
      }
    });

    // Flag that changes were made
    pixelDataChanged.value = true;

    // Save once for all changes
    saveToLocalStorage();

    // Schedule a debounced update
    debouncedSendToWled();
  }

  // Apply an entire array of pixels (for gradients, images, etc.)
  function applyPixelArray(newPixels: string[]): void {
    // Ensure we have some pixels to apply
    if (!newPixels || newPixels.length === 0) {
      console.warn("Empty pixel array - nothing to apply");
      return;
    }

    const expectedLength = gridWidth.value * gridHeight.value;

    // Only show an error if we're not in initialization
    if (newPixels.length !== expectedLength) {
      console.warn(
        `Pixel array length mismatch: got ${newPixels.length}, expected ${expectedLength}`
      );

      // If we're in initialization, just exit
      if (loading.value) {
        console.log("Skipping pixel array application during loading");
        return;
      }

      // Adapt the array to match expected length
      const adaptedPixels = [...newPixels];

      if (adaptedPixels.length > expectedLength) {
        // Truncate if too long
        adaptedPixels.length = expectedLength;
      } else if (adaptedPixels.length < expectedLength) {
        // Pad with black if too short
        while (adaptedPixels.length < expectedLength) {
          adaptedPixels.push("#000000");
        }
      }

      // Use the adapted array
      newPixels = adaptedPixels;
    }

    // Save current state to history
    saveToHistory({
      type: "clear",
      pixels: [...pixelData.value],
    });

    // Update all pixels
    pixelData.value = [...newPixels];
    pixelDataChanged.value = true;

    // Save and schedule update
    saveToLocalStorage();
    debouncedSendToWled();
  }

  // Send updates during active drawing with a short delay
  function sendDrawingUpdate(): void {
    // Use a shorter delay for drawing updates (25ms is responsive yet efficient)
    const drawingDelay = 25;

    // For drawing, we want to send updates more frequently
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    // Don't set the flag here since we're creating a new timer immediately
    debounceTimer = window.setTimeout(() => {
      if (pixelDataChanged.value) {
        sendToWledImmediate();
        debounceTimer = null;
      }
    }, drawingDelay);
  }

  // Force send all pending changes immediately
  function flushChanges(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    if (pixelDataChanged.value) {
      sendToWledImmediate();
    }
  }

  // Fetch information from the WLED device
  function fetchWledInfo(): void {
    loading.value = true;

    fetch(apiUrl.value, {
      method: "GET",
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    })
      .then((response) => response.json())
      .then((data) => {
        // Extract WLED URL from the API URL
        const url = new URL(apiUrl.value);
        wledUrl.value = `${url.protocol}//${url.hostname}`;

        // Update grid dimensions from WLED if available
        if (data.info && data.info.leds && data.info.leds.matrix) {
          gridWidth.value = data.info.leds.matrix.w;
          gridHeight.value = data.info.leds.matrix.h;

          // Save to localStorage
          localStorage.gridWidth = gridWidth.value;
          localStorage.gridHeight = gridHeight.value;
        }

        loading.value = false;
        error.value = false;

        // REMOVED: setupGrid() call from here - the watcher will handle it
      })
      .catch((error) => {
        console.error("WLED API Error:", error);
        loading.value = false;
        error.value = true;
      });
  }

  // Continue using the app without API connection
  function ignoreApiAndContinue(): void {
    ignoreApi.value = true;
    loading.value = false;
    error.value = false;
    setupGrid();
  }

  // ===== PERSISTENCE METHODS =====

  // Save current state to localStorage
  function saveToLocalStorage(): void {
    localStorage.pixelData = pixelData.value.toString();
    localStorage.currentColor = currentColor.value;
    localStorage.colorPalette = colorPalette.value.toString();
    localStorage.gridWidth = gridWidth.value;
    localStorage.gridHeight = gridHeight.value;
    localStorage.flipHorizontal = flipHorizontal.value;
    localStorage.flipVertical = flipVertical.value;
    localStorage.debounceDelay = debounceDelay.value;
    if (apiUrl.value) localStorage.apiUrl = apiUrl.value;
    // Note: History is saved separately to avoid circular calls
  }

  // Load history from localStorage
  function loadHistoryFromStorage(): void {
    if (localStorage.drawHistory) {
      try {
        history.value = JSON.parse(localStorage.drawHistory);
      } catch (e) {
        console.error("Error loading history from localStorage:", e);
        history.value = [];
      }
    }
  }

  // Load all settings from localStorage
  function loadFromLocalStorage(): void {
    // First, load the grid dimensions
    if (localStorage.gridWidth) {
      gridWidth.value = Number(localStorage.gridWidth);
    }

    if (localStorage.gridHeight) {
      gridHeight.value = Number(localStorage.gridHeight);
    }

    // API URL: load before initialize() picks a fallback so we don't clobber it
    if (localStorage.apiUrl) {
      apiUrl.value = localStorage.apiUrl;
    }

    if (localStorage.flipHorizontal) {
      flipHorizontal.value = Boolean(localStorage.flipHorizontal);
    }

    if (localStorage.flipVertical) {
      flipVertical.value = Boolean(localStorage.flipVertical);
    }

    // Then load the other settings
    if (localStorage.currentColor) {
      currentColor.value = localStorage.currentColor;
    }

    if (localStorage.colorPalette) {
      colorPalette.value = localStorage.colorPalette.split(",");
    }

    if (localStorage.debounceDelay) {
      try {
        const delay = Number(localStorage.debounceDelay);
        if (!isNaN(delay) && delay >= 0) {
          debounceDelay.value = delay;
        }
      } catch (e) {
        console.error("Error loading debounce delay from localStorage:", e);
      }
    }
  }

  // ===== KEYBOARD SHORTCUTS =====

  // Setup keyboard shortcuts (Ctrl+Z for undo)
  function setupKeyboardShortcuts(): void {
    document.addEventListener("keydown", (e) => {
      // Undo shortcut: Ctrl+Z / Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undo();
      }
    });
  }

  // ===== INITIALIZATION =====

  // Initialize the application
  function initialize(): void {
    isInitializing.value = true;

    // First load settings including grid dimensions and any saved apiUrl
    loadFromLocalStorage();

    // Only fall back to the hardcoded default if localStorage didn't supply one
    if (!apiUrl.value) {
      apiUrl.value = `http://192.168.68.123/json`;
    }

    // Setup grid with the dimensions we just loaded
    setupGrid();

    // Setup keyboard shortcuts
    setupKeyboardShortcuts();

    // Fetch WLED information
    fetchWledInfo();

    // Mark initialization as complete after a small delay
    // This allows any watchers to complete their work
    setTimeout(() => {
      isInitializing.value = false;
    }, 200);
  }

  // ===== WATCHERS =====

  // Watch for changes to grid dimensions and update the grid
  watch([gridWidth, gridHeight], () => {
    // Skip during initialization to avoid duplicate calls
    if (!isInitializing.value) {
      console.log(
        `Grid dimensions changed to ${gridWidth.value}x${gridHeight.value} - updating grid`
      );
      setupGrid();
    }
  });

  // Watch for changes to the API URL: persist and re-fetch WLED info
  watch(apiUrl, (newUrl) => {
    if (newUrl) localStorage.apiUrl = newUrl;
    fetchWledInfo();
  });

  // Watch for changes to debounce delay and save it
  watch(debounceDelay, (newDelay) => {
    localStorage.debounceDelay = newDelay;
  });

  // Initialize on component mount
  onMounted(() => {
    initialize();
  });

  // Return everything needed by components
  return {
    // State
    apiUrl,
    wledUrl,
    cellSize,
    gridWidth,
    gridHeight,
    flipHorizontal,
    flipVertical,
    pixelData,
    currentColor,
    colorPalette,
    loading,
    error,
    ignoreApi,
    wledJson,
    debounceDelay,

    // Methods
    updatePixel,
    batchUpdatePixels,
    applyPixelArray,
    sendToWledImmediate,
    sendDrawingUpdate, // Specific method for drawing updates
    flushChanges,
    undo,
    clearScreen,
    ignoreApiAndContinue,
    setupGrid,
  };
}
