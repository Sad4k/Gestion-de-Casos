import { createApp, ref, computed, onMounted } from 'vue';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, setDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDF0fwRZJUQfI1x0V16zmsmw6Jbe2p06jw",
  authDomain: "personal-apps-db.firebaseapp.com",
  projectId: "personal-apps-db",
  storageBucket: "personal-apps-db.firebasestorage.app",
  messagingSenderId: "312063054436",
  appId: "1:312063054436:web:b1f907040ab5ed26534571"
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
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const userId = currentUser.uid;
      const casosCollection = collection(db, "casos");
      const ownerQuery = query(casosCollection, where("owner", "==", userId));
      const sharedQuery = query(casosCollection, where("sharedWith", "array-contains", userId));
      const [ownerSnap, sharedSnap] = await Promise.all([getDocs(ownerQuery), getDocs(sharedQuery)]);
      let casesMap = {};
      ownerSnap.forEach(docSnap => {
        const data = docSnap.data();
        casesMap[docSnap.id] = { ...data, docId: docSnap.id, id: data.id || docSnap.id };
      });
      sharedSnap.forEach(docSnap => {
        const data = docSnap.data();
        casesMap[docSnap.id] = { ...data, docId: docSnap.id, id: data.id || docSnap.id };
      });
      casos.value = Object.values(casesMap);
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
          const userRef = doc(db, "users", user.uid);
          setDoc(userRef, { email: user.email, displayName: user.displayName || user.email }, { merge: true });
          loadCases();
        } else {
          isAuthenticated.value = false;
        }
      });
    });

    const filteredCases = computed(() => {
      let cases = [];
      
      if (!searchQuery.value.trim()) {
        cases = [...casos.value];
      } else {
        const query = searchQuery.value.toLowerCase();
        cases = casos.value.filter(caso => 
          caso.titulo.toLowerCase().includes(query) || 
          caso.descripcion.toLowerCase().includes(query) ||
          caso.id.toString().includes(query)
        );
      }

      // Sort cases by date (newest first) and then group by status
      cases.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));

      const groupedCases = {
        abierto: [],
        'en-proceso': [],
        pendiente: [],
        resuelto: [],
        cerrado: []
      };

      cases.forEach(caso => {
        if (groupedCases.hasOwnProperty(caso.estado)) {
          groupedCases[caso.estado].push(caso);
        }
      });

      return groupedCases;
    });

    const collapsedGroups = ref({
      abierto: false,
      'en-proceso': false,
      pendiente: false,
      resuelto: false,
      cerrado: false
    });

    const toggleGroup = (status) => {
      collapsedGroups.value[status] = !collapsedGroups.value[status];
    };

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
      // Modified to exclude closed cases
      const recentCases = casos.value
        .filter(caso => caso.estado !== 'cerrado')
        .sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion))
        .slice(0, 5);
      
      const pendingContactsByPerson = {};
      casos.value.forEach(caso => {
        // Only include pending contacts for non-closed cases
        if (caso.estado !== 'cerrado') {
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
        }
      });
      
      // ... rest of dashboardStats code ...
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
          }],
          owner: auth.currentUser.uid,
          sharedWith: []
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
        casos.value[index].historial = casos.value[index].historial.map(paso => ({
          ...paso,
          pendienteDeContacto: casos.value[index].estado === 'cerrado' ? '' : paso.pendienteDeContacto
        }));

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

    const shareEmail = ref('');
    const shareError = ref('');
    const showShareModal = ref(false);
    const isCaseOwner = computed(() => {
      return selectedCase.value && auth.currentUser && selectedCase.value.owner === auth.currentUser.uid;
    });

    const openShareModal = () => {
      shareEmail.value = '';
      shareError.value = '';
      showShareModal.value = true;
    };
    const closeShareModal = () => {
      showShareModal.value = false;
    };
    const shareCase = async () => {
      if (!selectedCase.value) return;
      if (!shareEmail.value.trim()) {
        shareError.value = "Ingrese un correo válido";
        return;
      }
      const usersCollection = collection(db, "users");
      const userQuery = query(usersCollection, where("email", "==", shareEmail.value.trim()));
      const snapshot = await getDocs(userQuery);
      if (snapshot.empty) {
        shareError.value = "Usuario no encontrado";
        return;
      }
      const targetUid = snapshot.docs[0].id;
      if (!selectedCase.value.sharedWith) {
        selectedCase.value.sharedWith = [];
      }
      if (selectedCase.value.sharedWith.includes(targetUid)) {
        shareError.value = "El caso ya ha sido compartido con este usuario";
        return;
      }
      selectedCase.value.sharedWith.push(targetUid);
      await updateCaseInFirebase(selectedCase.value);
      showNotification('success', 'Caso compartido correctamente');
      showShareModal.value = false;
    };

    const showPrintOptionsModal = ref(false);
    const printOptions = ref({
      status: 'all', // 'all', 'open', 'closed'
      mode: 'expanded' // 'expanded', 'compact'
    });

    const openPrintOptions = (type = 'single') => {
      printOptions.value = {
        status: 'all',
        mode: 'expanded',
        type // 'single' or 'all'
      };
      showPrintOptionsModal.value = true;
    };

    const executePrint = () => {
      if (printOptions.value.type === 'single') {
        printSingleCase();
      } else {
        printAllCases();
      }
      showPrintOptionsModal.value = false;
    };

    const closePrintOptionsModal = () => {
      showPrintOptionsModal.value = false;
    };

    const printSingleCase = () => {
      if (!selectedCase.value) return;
      
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <html>
          <head>
            <title>Caso: ${selectedCase.value.titulo}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; }
              .header { margin-bottom: 20px; }
              .section { margin-bottom: 15px; }
              .section-title { font-weight: bold; margin-bottom: 5px; }
              .timeline-entry { margin-bottom: 10px; padding-left: 20px; border-left: 2px solid #ccc; }
              .timeline-date { color: #666; font-size: 0.9em; }
              .printed-case-info { display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 2rem; }
              .printed-case-info > div { flex: 1; min-width: 250px; }
              .printed-image { max-width: 300px; margin: 10px 0; page-break-inside: avoid; }
              .print-section { margin-bottom: 1.5rem; }
              .print-section-title { font-weight: bold; margin-bottom: 0.5rem; color: #333; }
              img { max-width: 100%; display: block; margin: 10px 0; }
              ${printOptions.value.mode === 'compact' ? `
                .timeline-entry { padding-left: 10px; margin-bottom: 5px; }
                .timeline-description { display: none; }
                .printed-image { display: none; }
              ` : ''}
              @media print {
                body { font-size: 12px; }
                .header { font-size: 14px; }
                .printed-image { max-width: 200px; }
                .timeline-entry { page-break-inside: avoid; }
                img { page-break-inside: avoid; }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>${selectedCase.value.titulo}</h1>
            </div>
            
            <div class="printed-case-info">
              <div class="print-section">
                <div class="print-section-title">Estado</div>
                <p>${selectedCase.value.estado}</p>
              </div>
              
              <div class="print-section">
                <div class="print-section-title">Fecha de Creación</div>
                <p>${formatDate(selectedCase.value.fechaCreacion)}</p>
              </div>
              
              <div class="print-section">
                <div class="print-section-title">Descripción</div>
                <p>${selectedCase.value.descripcion}</p>
              </div>
              
              ${selectedCase.value.referencias && selectedCase.value.referencias.length ? `
                <div class="print-section">
                  <div class="print-section-title">Referencias</div>
                  <ul>
                    ${selectedCase.value.referencias.map(ref => `<li>${ref}</li>`).join('')}
                  </ul>
                </div>
              ` : ''}
            </div>
            
            ${selectedCase.value.historial && selectedCase.value.historial.length ? `
              <div class="section">
                <div class="section-title">Historial</div>
                ${selectedCase.value.historial.map(paso => `
                  <div class="timeline-entry">
                    <div class="timeline-date">${formatDate(paso.fecha)}</div>
                    <strong>${paso.titulo}</strong>
                    <p>${paso.descripcion}</p>
                    ${printOptions.value.mode === 'expanded' && paso.adjuntos ? 
                      paso.adjuntos.map(adj => 
                        adj.tipo.startsWith('image/') ? 
                        `<img class="printed-image" src="${adj.data}" alt="${adj.nombre}">` : 
                        ''
                      ).join('') : ''
                    }
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </body>
        </html>
      `);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    };

    const printAllCases = () => {
      const printWindow = window.open('', '_blank');
      
      // Filter cases based on status option
      let filteredCases = [...casos.value];
      if (printOptions.value.status === 'open') {
        filteredCases = filteredCases.filter(caso => caso.estado !== 'cerrado');
      } else if (printOptions.value.status === 'closed') {
        filteredCases = filteredCases.filter(caso => caso.estado === 'cerrado');
      }
      
      filteredCases.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));
      
      printWindow.document.write(`
        <html>
          <head>
            <title>Todos los Casos</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; }
              .case { 
                margin-bottom: 40px; 
                padding-bottom: 20px;
                border-bottom: 1px solid #ccc;
              }
              .header { margin-bottom: 20px; }
              .section { margin-bottom: 15px; }
              .section-title { font-weight: bold; margin-bottom: 5px; }
              .timeline-entry { margin-bottom: 10px; padding-left: 20px; border-left: 2px solid #ccc; }
              .timeline-date { color: #666; font-size: 0.9em; }
              .status-badge {
                display: inline-block;
                padding: 4px 8px;
                border-radius: 12px;
                font-size: 12px;
                font-weight: bold;
              }
              .abierto { background-color: #d1fae5; color: #065f46; }
              .en-proceso { background-color: #e0f2fe; color: #0c4a6e; }
              .pendiente { background-color: #fef3c7; color: #92400e; }
              .resuelto { background-color: #ddd6fe; color: #5b21b6; }
              .cerrado { background-color: #e5e7eb; color: #1f2937; }
              ${printOptions.value.mode === 'compact' ? `
                .case { margin-bottom: 20px; padding-bottom: 10px; }
                .timeline-entry { display: none; }
                .description { display: none; }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
              ` : ''}
              @media print {
                body { font-size: 12px; }
                .header { font-size: 14px; }
                .case { page-break-inside: avoid; }
              }
            </style>
          </head>
          <body>
            <h1>Reporte de Casos - ${new Date().toLocaleDateString()}</h1>
            ${printOptions.value.mode === 'compact' ? `
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Título</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  ${filteredCases.map(caso => `
                    <tr>
                      <td>${caso.id}</td>
                      <td>${caso.titulo}</td>
                      <td><span class="status-badge ${caso.estado}">${caso.estado}</span></td>
                      <td>${formatDate(caso.fechaCreacion)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : `
              ${filteredCases.map(caso => `
                <div class="case">
                  <div class="header">
                    <h2>${caso.titulo}</h2>
                    <p>ID: ${caso.id}</p>
                    <p>Estado: <span class="status-badge ${caso.estado}">${caso.estado}</span></p>
                    <p>Fecha de Creación: ${formatDate(caso.fechaCreacion)}</p>
                  </div>
                  
                  <div class="section">
                    <div class="section-title">Descripción</div>
                    <p>${caso.descripcion}</p>
                  </div>
                  
                  ${caso.referencias && caso.referencias.length ? `
                    <div class="section">
                      <div class="section-title">Referencias</div>
                      <ul>
                        ${caso.referencias.map(ref => `<li>${ref}</li>`).join('')}
                      </ul>
                    </div>
                  ` : ''}
                  
                  ${caso.historial && caso.historial.length ? `
                    <div class="section">
                      <div class="section-title">Historial</div>
                      ${caso.historial.map(paso => `
                        <div class="timeline-entry">
                          <div class="timeline-date">${formatDate(paso.fecha)}</div>
                          <strong>${paso.titulo}</strong>
                          <p>${paso.descripcion}</p>
                        </div>
                      `).join('')}
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            `}
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
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
      openConfigModal, closeConfigModal, openResetConfirmModal, closeResetConfirmModal, resetAllData,
      shareEmail, shareError, showShareModal, openShareModal, closeShareModal, shareCase, isCaseOwner,
      collapsedGroups, toggleGroup,
      showPrintOptionsModal, printOptions, openPrintOptions, executePrint, closePrintOptionsModal,
    };
  }
}).mount('#app');
