import logging
from pathlib import Path
from optimum.onnxruntime import ORTModelForSequenceClassification
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from peft import PeftModel, PeftConfig

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

LORA_MODEL_DIR = Path(__file__).resolve().parent.parent / "ml_models" / "peii_sentiment_v1_lora"
ONNX_OUTPUT_DIR = Path(__file__).resolve().parent.parent / "ml_models" / "peii_sentiment_v1_onnx"
MERGED_MODEL_DIR = Path(__file__).resolve().parent.parent / "ml_models" / "peii_sentiment_v1_merged"

def main():
    if not LORA_MODEL_DIR.exists():
        logger.error(f"LoRA model not found at {LORA_MODEL_DIR}. Please run train_sentiment.py first.")
        return
        
    logger.info(f"Merging LoRA adapters into base model...")
    config = PeftConfig.from_pretrained(str(LORA_MODEL_DIR))
    tokenizer = AutoTokenizer.from_pretrained(str(LORA_MODEL_DIR))
    
    base_model = AutoModelForSequenceClassification.from_pretrained(
        config.base_model_name_or_path,
        num_labels=3,
        ignore_mismatched_sizes=True
    )
    model = PeftModel.from_pretrained(base_model, str(LORA_MODEL_DIR))
    merged_model = model.merge_and_unload()
    
    MERGED_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    merged_model.save_pretrained(str(MERGED_MODEL_DIR))
    tokenizer.save_pretrained(str(MERGED_MODEL_DIR))
    
    logger.info(f"Exporting merged model from {MERGED_MODEL_DIR} to ONNX format...")
    ONNX_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    ort_model = ORTModelForSequenceClassification.from_pretrained(
        str(MERGED_MODEL_DIR), 
        export=True,
    )
    
    # Save the unquantized ONNX model
    ort_model.save_pretrained(str(ONNX_OUTPUT_DIR))
    tokenizer.save_pretrained(str(ONNX_OUTPUT_DIR))
    logger.info(f"Successfully exported to ONNX in {ONNX_OUTPUT_DIR}")
    
    # Quantize to 8-bit using Optimum ORTQuantizer (dynamic quantization)
    from optimum.onnxruntime.configuration import AutoQuantizationConfig
    from optimum.onnxruntime import ORTQuantizer
    
    logger.info("Applying dynamic 8-bit quantization for CPU inference (ARM64 friendly)...")
    quantizer = ORTQuantizer.from_pretrained(ort_model)
    dqconfig = AutoQuantizationConfig.avx2(is_static=False, per_channel=False)
    
    quantizer.quantize(
        save_dir=str(ONNX_OUTPUT_DIR),
        quantization_config=dqconfig,
    )
    
    logger.info(f"Quantization complete. Model saved in {ONNX_OUTPUT_DIR}")
    
if __name__ == "__main__":
    main()
