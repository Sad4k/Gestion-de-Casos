import { createApp, ref, computed, onMounted } from 'vue';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

createApp({
  setup() {
    const isAuthenticated = ref(false);
    const loginForm = ref({ username: '', password: '' });
    const errorLogin = ref('');

    const casos = ref([]);
    const selectedCase = ref(null);
    const searchQuery = ref('');
    const currentView = ref('dashboard');

    const showModal = ref(false);
    const showStepModal = ref(false);
    const showDeleteModal = ref(false);
    const showFileViewerModal = ref(false);
    const showCloseCaseModal = ref(false);
    const showEditStepModal = ref(false);
    const showDeleteStepModal = ref(false);
    const showConfigModal = ref(false);
    const showResetConfirmModal = ref(false);
    const attachmentFiles = ref([]);
    const closeCaseFiles = ref([]);
    const currentViewingFile = ref(null);
    const currentStepIndex = ref(null);
    const modalTitle = ref('Nuevo Caso');
    const caseForm = ref({
      titulo: '',
      descripcion: '',
      estado: 'abierto',
      referencias: [''],
      pendienteDeContacto: ''
    });
    const stepForm = ref({
      titulo: '',
      descripcion: '',
      fecha: new Date().toISOString(),
      adjuntos: [],
      pendienteDeContacto: ''
    });
    const notification = ref({
      show: false,
      type: 'success',
      message: '',
      progress: 100,
      timeout: null
    });

    const loadCases = async () => {
      const snapshot = await getDocs(collection(db, "casos"));
      casos.value = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return { ...data, docId: docSnap.id, id: data.id || docSnap.id };
      });
    };

    const updateCaseInFirebase = async (updatedCase) => {
      if (!updatedCase.docId) return;
      const caseRef = doc(db, "casos", updatedCase.docId);
      await updateDoc(caseRef, { ...updatedCase });
    };

    const login = async () => {
      try {
        const userCredential = await signInWithEmailAndPassword(auth, loginForm.value.username, loginForm.value.password);
        isAuthenticated.value = true;
        errorLogin.value = '';
        await loadCases();
      } catch (error) {
        errorLogin.value = error.message;
      }
    };

    const logout = async () => {
      try {
        await signOut(auth);
        isAuthenticated.value = false;
      } catch (error) {
        console.error("Error signing out:", error);
      }
    };

    onMounted(() => {
      onAuthStateChanged(auth, (user) => {
        if (user) {
          isAuthenticated.value = true;
          loadCases();
        } else {
          isAuthenticated.value = false;
        }
      });
    });

    const filteredCases = computed(() => {
      if (!searchQuery.value.trim()) return casos.value;
      const query = searchQuery.value.toLowerCase();
      return casos.value.filter(caso => 
        caso.titulo.toLowerCase().includes(query) || 
        caso.descripcion.toLowerCase().includes(query) ||
        caso.id.toString().includes(query)
      );
    });

    const dashboardStats = computed(() => {
      const total = casos.value.length;
      const byStatus = { abierto: 0, 'en-proceso': 0, pendiente: 0, resuelto: 0, cerrado: 0 };
      casos.value.forEach(caso => {
        if (byStatus.hasOwnProperty(caso.estado)) { byStatus[caso.estado]++; }
      });
      const percentages = {};
      for (const status in byStatus) {
        percentages[status] = total > 0 ? (byStatus[status] / total) * 100 : 0;
      }
      const recentCases = [...casos.value]
        .sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion))
        .slice(0, 5);
      const pendingContactsByPerson = {};
      casos.value.forEach(caso => {
        if (caso.pendienteDeContacto && caso.pendienteDeContacto.trim() !== '') {
          if (!pendingContactsByPerson[caso.pendienteDeContacto]) {
            pendingContactsByPerson[caso.pendienteDeContacto] = [];
          }
          pendingContactsByPerson[caso.pendienteDeContacto].push({
            id: caso.id,
            titulo: caso.titulo,
            descripcion: caso.descripcion,
            estado: caso.estado,
            fromMainCase: true
          });
        }
        if (caso.historial && caso.historial.length) {
          caso.historial.forEach(step => {
            if (step.pendienteDeContacto && step.pendienteDeContacto.trim() !== '') {
              if (!pendingContactsByPerson[step.pendienteDeContacto]) {
                pendingContactsByPerson[step.pendienteDeContacto] = [];
              }
              const existingCase = pendingContactsByPerson[step.pendienteDeContacto]
                .find(c => c.id === caso.id && c.stepTitle === step.titulo);
              if (!existingCase) {
                pendingContactsByPerson[step.pendienteDeContacto].push({
                  id: caso.id,
                  titulo: caso.titulo,
                  descripcion: caso.descripcion,
                  estado: caso.estado,
                  stepTitle: step.titulo,
                  stepDescription: step.descripcion
                });
              }
            }
          });
        }
      });
      const pendingContactsArray = Object.keys(pendingContactsByPerson).map(person => ({
        person,
        cases: pendingContactsByPerson[person]
      }));
      return {
        total,
        byStatus,
        percentages,
        recentCases,
        pendingContactsArray,
        openCases: byStatus.abierto + byStatus['en-proceso'] + byStatus.pendiente,
        resolvedCases: byStatus.resuelto + byStatus.cerrado
      };
    });

    const showNewCaseModal = () => {
      modalTitle.value = 'Nuevo Caso';
      caseForm.value = { titulo: '', descripcion: '', estado: 'abierto', referencias: [''], pendienteDeContacto: '' };
      showModal.value = true;
    };

    const editCase = () => {
      if (!selectedCase.value) return;
      if (selectedCase.value.estado === 'cerrado') {
        notification.value = { show: true, type: 'error', message: 'No se puede editar un caso cerrado', progress: 100, timeout: null };
        return;
      }
      modalTitle.value = 'Editar Caso';
      caseForm.value = {
        titulo: selectedCase.value.titulo,
        descripcion: selectedCase.value.descripcion,
        estado: selectedCase.value.estado,
        referencias: [...selectedCase.value.referencias] || [''],
        pendienteDeContacto: selectedCase.value.pendienteDeContacto || ''
      };
      showModal.value = true;
    };

    const saveCase = async () => {
      if (!caseForm.value.titulo.trim() || !caseForm.value.descripcion.trim()) {
        notification.value = { show: true, type: 'error', message: 'Por favor complete todos los campos obligatorios', progress: 100, timeout: null };
        return;
      }
      const cleanReferences = caseForm.value.referencias.filter(ref => ref.trim() !== '');
      if (modalTitle.value === 'Nuevo Caso') {
        const newCase = {
          titulo: caseForm.value.titulo,
          descripcion: caseForm.value.descripcion,
          estado: caseForm.value.estado,
          fechaCreacion: new Date().toISOString(),
          referencias: cleanReferences,
          pendienteDeContacto: caseForm.value.pendienteDeContacto || '',
          historial: [{
            titulo: 'Caso abierto',
            descripcion: 'Se inició el caso en el sistema.',
            fecha: new Date().toISOString()
          }]
        };
        const docRef = await addDoc(collection(db, "casos"), newCase);
        newCase.id = docRef.id;
        newCase.docId = docRef.id;
        casos.value.push(newCase);
        selectedCase.value = newCase;
        notification.value = { show: true, type: 'success', message: 'Caso creado correctamente', progress: 100, timeout: null };
      } else {
        const index = casos.value.findIndex(c => c.id === selectedCase.value.id);
        if (index !== -1) {
          casos.value[index] = {
            ...casos.value[index],
            titulo: caseForm.value.titulo,
            descripcion: caseForm.value.descripcion,
            estado: caseForm.value.estado,
            referencias: cleanReferences,
            pendienteDeContacto: caseForm.value.pendienteDeContacto || ''
          };
          selectedCase.value = casos.value[index];
          await updateCaseInFirebase(selectedCase.value);
          notification.value = { show: true, type: 'success', message: 'Caso actualizado correctamente', progress: 100, timeout: null };
        }
      }
      showModal.value = false;
    };

    const confirmDeleteCase = () => {
      if (!selectedCase.value) return;
      if (selectedCase.value.estado === 'cerrado') {
        notification.value = { show: true, type: 'error', message: 'No se puede eliminar un caso cerrado', progress: 100, timeout: null };
        return;
      }
      showDeleteModal.value = true;
    };

    const deleteCase = async () => {
      if (!selectedCase.value) return;
      await deleteDoc(doc(db, "casos", selectedCase.value.docId));
      const index = casos.value.findIndex(c => c.id === selectedCase.value.id);
      if (index !== -1) {
        casos.value.splice(index, 1);
        selectedCase.value = null;
        notification.value = { show: true, type: 'success', message: 'Caso eliminado correctamente', progress: 100, timeout: null };
      }
      showDeleteModal.value = false;
    };

    const selectCase = (caso) => { selectedCase.value = caso; };

    const showAddStepModal = () => {
      if (!selectedCase.value) return;
      if (selectedCase.value.estado === 'cerrado') {
        notification.value = { show: true, type: 'error', message: 'No se pueden añadir pasos a un caso cerrado', progress: 100, timeout: null };
        return;
      }
      stepForm.value = { titulo: '', descripcion: '', fecha: new Date().toISOString(), adjuntos: [], pendienteDeContacto: '' };
      attachmentFiles.value = [];
      showStepModal.value = true;
    };

    const editStep = (index) => {
      if (!selectedCase.value || !selectedCase.value.historial) return;
      if (selectedCase.value.estado === 'cerrado') {
        notification.value = { show: true, type: 'error', message: 'No se pueden editar pasos de un caso cerrado', progress: 100, timeout: null };
        return;
      }
      const paso = selectedCase.value.historial[index];
      if (!paso) return;
      currentStepIndex.value = index;
      stepForm.value = {
        titulo: paso.titulo,
        descripcion: paso.descripcion,
        fecha: paso.fecha,
        adjuntos: paso.adjuntos || [],
        pendienteDeContacto: paso.pendienteDeContacto || ''
      };
      attachmentFiles.value = paso.adjuntos ? [...paso.adjuntos] : [];
      showEditStepModal.value = true;
    };

    const confirmDeleteStep = (index) => {
      if (!selectedCase.value || !selectedCase.value.historial) return;
      if (selectedCase.value.estado === 'cerrado') {
        notification.value = { show: true, type: 'error', message: 'No se pueden eliminar pasos de un caso cerrado', progress: 100, timeout: null };
        return;
      }
      currentStepIndex.value = index;
      showDeleteStepModal.value = true;
    };

    const deleteStep = async () => {
      if (!selectedCase.value || currentStepIndex.value === null) return;
      const caseIndex = casos.value.findIndex(c => c.id === selectedCase.value.id);
      if (caseIndex === -1) return;
      const stepToDelete = selectedCase.value.historial[currentStepIndex.value];
      casos.value[caseIndex].historial.push({
        titulo: 'Paso eliminado',
        descripcion: `Se eliminó el paso "${stepToDelete.titulo}"`,
        fecha: new Date().toISOString(),
        isSystemAction: true
      });
      casos.value[caseIndex].historial.splice(currentStepIndex.value, 1);
      selectedCase.value = casos.value[caseIndex];
      await updateCaseInFirebase(casos.value[caseIndex]);
      notification.value = { show: true, type: 'success', message: 'Paso eliminado correctamente', progress: 100, timeout: null };
      showDeleteStepModal.value = false;
      currentStepIndex.value = null;
    };

    const updateStep = async () => {
      if (!selectedCase.value || currentStepIndex.value === null) return;
      if (!stepForm.value.titulo.trim() || !stepForm.value.descripcion.trim()) {
        notification.value = { show: true, type: 'error', message: 'Por favor complete todos los campos obligatorios', progress: 100, timeout: null };
        return;
      }
      const caseIndex = casos.value.findIndex(c => c.id === selectedCase.value.id);
      if (caseIndex === -1) return;
      const originalStep = { ...selectedCase.value.historial[currentStepIndex.value] };
      const processedAdjuntos = attachmentFiles.value.map(file => ({
        nombre: file.nombre || file.name,
        tipo: file.tipo || file.type,
        tamano: file.tamano || file.size,
        data: file.data
      }));
      casos.value[caseIndex].historial[currentStepIndex.value] = {
        titulo: stepForm.value.titulo,
        descripcion: stepForm.value.descripcion,
        fecha: originalStep.fecha,
        adjuntos: processedAdjuntos,
        pendienteDeContacto: stepForm.value.pendienteDeContacto || '',
        lastEdited: new Date().toISOString()
      };
      casos.value[caseIndex].historial.push({
        titulo: 'Paso editado',
        descripcion: `Se editó el paso "${originalStep.titulo}"`,
        fecha: new Date().toISOString(),
        isSystemAction: true
      });
      selectedCase.value = casos.value[caseIndex];
      await updateCaseInFirebase(casos.value[caseIndex]);
      notification.value = { show: true, type: 'success', message: 'Paso actualizado correctamente', progress: 100, timeout: null };
      showEditStepModal.value = false;
      currentStepIndex.value = null;
    };

    const saveStep = async () => {
      if (!selectedCase.value) return;
      if (!stepForm.value.titulo.trim() || !stepForm.value.descripcion.trim()) {
        notification.value = { show: true, type: 'error', message: 'Por favor complete todos los campos obligatorios', progress: 100, timeout: null };
        return;
      }
      const index = casos.value.findIndex(c => c.id === selectedCase.value.id);
      if (index !== -1) {
        const processedAdjuntos = attachmentFiles.value.map(file => ({
          nombre: file.name,
          tipo: file.type,
          tamano: file.size,
          data: file.data
        }));
        casos.value[index].historial.push({
          titulo: stepForm.value.titulo,
          descripcion: stepForm.value.descripcion,
          fecha: new Date().toISOString(),
          adjuntos: processedAdjuntos,
          pendienteDeContacto: stepForm.value.pendienteDeContacto || ''
        });
        selectedCase.value = casos.value[index];
        await updateCaseInFirebase(casos.value[index]);
        notification.value = { show: true, type: 'success', message: 'Paso añadido correctamente', progress: 100, timeout: null };
        showStepModal.value = false;
      }
    };

    const addReference = () => { caseForm.value.referencias.push(''); };
    const removeReference = (index) => {
      caseForm.value.referencias.splice(index, 1);
      if (caseForm.value.referencias.length === 0) { caseForm.value.referencias.push(''); }
    };

    const closeModal = () => { showModal.value = false; };
    const closeStepModal = () => { showStepModal.value = false; };
    const closeDeleteModal = () => { showDeleteModal.value = false; };
    const closeEditStepModal = () => { showEditStepModal.value = false; currentStepIndex.value = null; };
    const closeDeleteStepModal = () => { showDeleteStepModal.value = false; currentStepIndex.value = null; };

    const handleFileUpload = (event) => {
      const files = event.target.files;
      if (!files.length) return;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        reader.onload = (e) => {
          attachmentFiles.value.push({ name: file.name, type: file.type, size: file.size, data: e.target.result });
        };
        reader.readAsDataURL(file);
      }
    };
    const removeAttachment = (index) => { attachmentFiles.value.splice(index, 1); };
    const handleCloseCaseFileUpload = (event) => {
      const files = event.target.files;
      if (!files.length) return;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        reader.onload = (e) => {
          closeCaseFiles.value.push({ name: file.name, type: file.type, size: file.size, data: e.target.result });
        };
        reader.readAsDataURL(file);
      }
    };
    const removeCloseCaseFile = (index) => { closeCaseFiles.value.splice(index, 1); };

    const formatFileSize = (bytes) => {
      if (bytes < 1024) return bytes + ' bytes';
      else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
      else return (bytes / 1048576).toFixed(1) + ' MB';
    };
    const viewAttachment = (attachment) => { currentViewingFile.value = attachment; showFileViewerModal.value = true; };
    const closeFileViewer = () => { showFileViewerModal.value = false; currentViewingFile.value = null; };
    const getFileIcon = (fileType) => {
      if (fileType.includes('image')) {
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/>
            <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
            <path d="M21 15L16 10L6 20" stroke="currentColor" stroke-width="2"/>
        </svg>`;
      } else if (fileType.includes('pdf')) {
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2H6C4.89543 2 4 2.89543 4 4Z" stroke="currentColor" stroke-width="2"/>
            <path d="M14 2V8H20" stroke="currentColor" stroke-width="2"/>
            <path d="M9 15H15" stroke="currentColor" stroke-width="2"/>
            <path d="M9 11H15" stroke="currentColor" stroke-width="2"/>
        </svg>`;
      } else if (fileType.includes('excel') || fileType.includes('sheet') || fileType.includes('csv')) {
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2H6C4.89543 2 4 2.89543 4 4Z" stroke="currentColor" stroke-width="2"/>
            <path d="M14 2V8H20" stroke="currentColor" stroke-width="2"/>
            <path d="M8 13H10V17H8V13Z" stroke="currentColor" stroke-width="2"/>
            <path d="M14 13H16V17H14V13Z" stroke="currentColor" stroke-width="2"/>
        </svg>`;
      } else if (fileType.includes('word') || fileType.includes('document')) {
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2H6C4.89543 2 4 2.89543 4 4Z" stroke="currentColor" stroke-width="2"/>
            <path d="M14 2V8H20" stroke="currentColor" stroke-width="2"/>
            <path d="M8 12L16 12" stroke="currentColor" stroke-width="2"/>
            <path d="M8 16L16 16" stroke="currentColor" stroke-width="2"/>
        </svg>`;
      } else if (fileType.includes('email') || fileType.includes('message')) {
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" stroke-width="2"/>
            <path d="M22 7L13.03 14.2C12.42 14.68 11.58 14.68 10.97 14.2L2 7" stroke="currentColor" stroke-width="2"/>
        </svg>`;
      } else {
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2H6C4.89543 2 4 2.89543 4 4Z" stroke="currentColor" stroke-width="2"/>
            <path d="M14 2V8H20" stroke="currentColor" stroke-width="2"/>
        </svg>`;
      }
    };

    const formatDate = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('es', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    };
    const truncateText = (text, maxLength) => {
      if (!text) return '';
      return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    };

    const showNotification = (type, message, duration = 5000) => {
      if (notification.value.timeout) {
        clearTimeout(notification.value.timeout);
        clearInterval(notification.value.interval);
      }
      notification.value = { show: true, type, message, progress: 100, timeout: null, interval: null };
      const step = 100 / (duration / 100);
      notification.value.interval = setInterval(() => {
        notification.value.progress -= step;
        if (notification.value.progress <= 0) { clearInterval(notification.value.interval); }
      }, 100);
      notification.value.timeout = setTimeout(() => { notification.value.show = false; }, duration);
    };

    const navigateTo = (view) => { currentView.value = view; };

    const closeCase = () => {
      if (!selectedCase.value) return;
      if (selectedCase.value.estado === 'cerrado') {
        notification.value = { show: true, type: 'error', message: 'Este caso ya está cerrado', progress: 100, timeout: null };
        return;
      }
      closeCaseFiles.value = [];
      showCloseCaseModal.value = true;
    };

    const confirmCloseCase = async () => {
      if (!selectedCase.value) return;
      const index = casos.value.findIndex(c => c.id === selectedCase.value.id);
      if (index !== -1) {
        const processedAdjuntos = closeCaseFiles.value.map(file => ({
          nombre: file.name,
          tipo: file.type,
          tamano: file.size,
          data: file.data
        }));
        casos.value[index].estado = 'cerrado';
        if (!casos.value[index].historial) { casos.value[index].historial = []; }
        casos.value[index].historial.push({
          titulo: 'Caso cerrado',
          descripcion: 'Se ha cerrado el caso con la evidencia correspondiente.',
          fecha: new Date().toISOString(),
          adjuntos: processedAdjuntos
        });
        selectedCase.value = casos.value[index];
        await updateCaseInFirebase(casos.value[index]);
        notification.value = { show: true, type: 'success', message: 'Caso cerrado correctamente', progress: 100, timeout: null };
        showCloseCaseModal.value = false;
      }
    };

    const closeCloseCaseModal = () => { showCloseCaseModal.value = false; };

    const openConfigModal = () => { showConfigModal.value = true; };
    const closeConfigModal = () => { showConfigModal.value = false; };
    const openResetConfirmModal = () => { showResetConfirmModal.value = true; closeConfigModal(); };
    const closeResetConfirmModal = () => { showResetConfirmModal.value = false; };
    const resetAllData = async () => {
      const snapshot = await getDocs(collection(db, "casos"));
      snapshot.forEach(async (docSnap) => { await deleteDoc(doc(db, "casos", docSnap.id)); });
      casos.value = [];
      selectedCase.value = null;
      notification.value = { show: true, type: 'success', message: 'Datos restablecidos correctamente', progress: 100, timeout: null };
      closeResetConfirmModal();
      closeConfigModal();
    };

    return {
      isAuthenticated, loginForm, errorLogin, login, logout,
      casos, selectedCase, searchQuery, filteredCases, showModal, showStepModal,
      showDeleteModal, showFileViewerModal, showCloseCaseModal, showEditStepModal,
      showDeleteStepModal, showConfigModal, showResetConfirmModal, modalTitle,
      caseForm, stepForm, notification, currentView, dashboardStats, attachmentFiles,
      closeCaseFiles, currentViewingFile, currentStepIndex,
      showNewCaseModal, editCase, saveCase, confirmDeleteCase, deleteCase, selectCase,
      closeCase, confirmCloseCase, closeCloseCaseModal,
      showAddStepModal, editStep, saveStep, updateStep, confirmDeleteStep, deleteStep,
      handleFileUpload, handleCloseCaseFileUpload, removeAttachment, removeCloseCaseFile,
      viewAttachment, closeFileViewer, formatFileSize, getFileIcon, addReference, removeReference,
      navigateTo, closeModal, closeStepModal, closeDeleteModal, closeEditStepModal, closeDeleteStepModal,
      formatDate, truncateText, showNotification,
      openConfigModal, closeConfigModal, openResetConfirmModal, closeResetConfirmModal, resetAllData
    };
  }
}).mount('#app');