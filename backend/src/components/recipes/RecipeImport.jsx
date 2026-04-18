import { useState } from 'react'
import { X, Upload, Loader } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import toast from 'react-hot-toast'

export default function RecipeImport({ onExtract, onCancel }) {
  const { t, lang } = useLanguage()
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleFileSelect = (f) => {
    if (!f) return
    setFile(f)

    // Preview for images
    if (f.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => setPreview(e.target.result)
      reader.readAsDataURL(f)
    } else {
      setPreview(null)
    }
  }

  const handleExtract = async () => {
    if (!file) {
      toast.error(lang === 'ar' ? 'اختر صورة أو PDF' : 'Select an image or PDF')
      return
    }

    setLoading(true)
    try {
      // Read file as base64
      const reader = new FileReader()
      reader.onload = async (e) => {
        const base64 = e.target.result.split(',')[1]
        const mimeType = file.type

        // Call Edge Function for AI extraction
        const { supabase } = await import('../../lib/supabase')
        const { data, error } = await supabase.functions.invoke('extract-recipe', {
          body: {
            base64,
            mimeType,
            fileName: file.name,
          },
        })

        if (error) {
          toast.error(t('extractError'))
          console.error(error)
        } else if (data?.recipe) {
          toast.success(t('extractSuccess'))
          onExtract(data.recipe)
        } else {
          toast.error(t('extractError'))
        }
      }
      reader.readAsDataURL(file)
    } catch (err) {
      toast.error(t('extractError'))
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-lg">{t('importRecipe')}</h2>
          <button onClick={onCancel} className="text-noch-muted hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Upload Area */}
        <label className="border-2 border-dashed border-noch-border rounded-xl p-8 text-center cursor-pointer hover:border-noch-green/40 hover:bg-noch-green/5 transition-colors block">
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => handleFileSelect(e.target.files?.[0])}
            className="hidden"
          />
          <Upload size={32} className="mx-auto mb-2 text-noch-muted" />
          <p className="text-white font-medium mb-1">
            {file ? file.name : lang === 'ar' ? 'اسحب أو انقر للاختيار' : 'Drag or click to select'}
          </p>
          <p className="text-xs text-noch-muted">
            {lang === 'ar' ? 'صورة (JPG, PNG) أو PDF' : 'Image (JPG, PNG) or PDF'}
          </p>
        </label>

        {/* Preview */}
        {preview && (
          <div className="mt-4 rounded-lg overflow-hidden bg-noch-border p-2">
            <img src={preview} alt="preview" className="w-full h-32 object-cover rounded" />
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="btn-secondary flex-1">{t('cancel')}</button>
          <button
            onClick={handleExtract}
            disabled={!file || loading}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {loading && <Loader size={14} className="animate-spin" />}
            {t(loading ? 'extracting' : 'saveTask')}
          </button>
        </div>

        <p className="text-xs text-noch-muted text-center mt-4">
          {lang === 'ar'
            ? 'سيتم استخراج: الكود، الاسم، المكونات، خطوات التحضير، والطبقات'
            : 'Will extract: code, name, ingredients, steps, and layers'}
        </p>
      </div>
    </div>
  )
}
