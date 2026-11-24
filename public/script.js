const form = document.getElementById("registrationForm");
const submitButton = document.getElementById("submitButton");
const formMessage = document.getElementById("formMessage");
const isFilePreview = window.location.protocol === "file:";
const appConfig = window.APP_CONFIG || {};
const supabaseUrl = appConfig.supabaseUrl || "";
const supabaseAnonKey = appConfig.supabaseAnonKey || "";
const supabaseBucket = appConfig.supabaseBucket || "payment-proofs";
const supabaseClient =
  supabaseUrl && supabaseAnonKey && window.supabase
    ? window.supabase.createClient(supabaseUrl, supabaseAnonKey)
    : null;

const tripConfig = {
  submissionPrefix: "SC",
  tripName: "Building AI Readiness for the Future Economy (Shenzhen & Guangzhou)",
  amountValue: 2750,
  amountDisplay: "SGD 2,750.00",
  payeeName: "Sing-China",
  successPath: "/success.html",
  idleButtonLabel: "Submit Payment Confirmation",
  maxFileSizeMB: 10
};

submitButton.dataset.idleLabel = tripConfig.idleButtonLabel;

const requireInvoiceRadios = form.querySelectorAll('input[name="requireInvoice"]');
const invoiceNameLabel = document.getElementById("invoiceNameLabel");
const invoiceNameInput = form.querySelector('input[name="invoiceName"]');

function toggleInvoiceNameField() {
  const selected = form.querySelector('input[name="requireInvoice"]:checked');
  const needsInvoice = selected && selected.value === "yes";
  if (invoiceNameLabel && invoiceNameInput) {
    invoiceNameLabel.hidden = !needsInvoice;
    invoiceNameInput.required = needsInvoice;
  }
}

requireInvoiceRadios.forEach((radio) => {
  radio.addEventListener("change", toggleInvoiceNameField);
});
toggleInvoiceNameField();

function setMessage(message, state) {
  formMessage.textContent = message;
  if (state) {
    formMessage.dataset.state = state;
  } else {
    delete formMessage.dataset.state;
  }
}

function createSubmissionId() {
  const prefix = tripConfig.submissionPrefix;
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now()}-${randomPart}`;
}

function validateFile(file) {
  if (!file) return { ok: false, error: "Please upload your payment receipt." };
  const allowedTypes = /^image\/(jpeg|jpg|png|gif|webp)|application\/pdf$/i;
  if (!allowedTypes.test(file.type)) {
    return { ok: false, error: "Invalid file type. Please upload JPG, PNG or PDF only." };
  }
  const maxBytes = tripConfig.maxFileSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return { ok: false, error: `File too large. Max size is ${tripConfig.maxFileSizeMB} MB.` };
  }
  return { ok: true };
}

async function uploadPaymentProof(file, submissionId) {
  if (!supabaseClient) throw new Error("Supabase client is not available.");

  const fileExt = (file.name.split(".").pop() || "bin").toLowerCase();
  const safeName = `${submissionId}.${fileExt}`;
  const filePath = `${safeName}`;

  const { error: uploadError } = await supabaseClient.storage
    .from(supabaseBucket)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type
    });

  if (uploadError) throw uploadError;

  const { data } = await supabaseClient.storage
    .from(supabaseBucket)
    .createSignedUrl(filePath, 60 * 60 * 24 * 365);

  return {
    path: filePath,
    name: file.name,
    type: file.type,
    size: file.size,
    url: data ? data.signedUrl : null
  };
}

async function notifyDingTalk(payload) {
  const response = await fetch("/api/dingtalk-notify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || "DingTalk notification failed.");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isFilePreview) {
    setMessage("This is preview mode only. To submit the form, please deploy it with Supabase configured.", "error");
    return;
  }

  if (!supabaseClient) {
    setMessage("Supabase is not configured yet. Please complete public/config.js before going live.", "error");
    return;
  }

  const paymentProofInput = form.querySelector('input[name="paymentProof"]');
  const paymentProofFile = paymentProofInput && paymentProofInput.files && paymentProofInput.files[0];
  const fileCheck = validateFile(paymentProofFile);
  if (!fileCheck.ok) {
    setMessage(fileCheck.error, "error");
    return;
  }

  const requireInvoice = form.querySelector('input[name="requireInvoice"]:checked').value === "yes";
  if (requireInvoice) {
    const invoiceNameVal = (invoiceNameInput.value || "").trim();
    if (!invoiceNameVal) {
      setMessage("Please enter the invoice / billing entity name.", "error");
      return;
    }
  }

  if (!form.reportValidity()) {
    setMessage("Please complete all required fields before submitting.", "error");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";
  setMessage("Uploading your payment receipt and submitting confirmation, please wait.", "");

  try {
    const formData = new FormData(form);
    const submissionId = createSubmissionId();
    const fullName = String(formData.get("fullName") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const contactNumber = String(formData.get("contactNumber") || "").trim();
    const companyName = String(formData.get("companyName") || "").trim();
    const designation = String(formData.get("designation") || "").trim();
    const companyDesignation = [companyName, designation].filter(Boolean).join(" - ");
    const requireInvoiceVal = String(formData.get("requireInvoice") || "no").trim();
    const invoiceName = requireInvoiceVal === "yes"
      ? String(formData.get("invoiceName") || "").trim() || null
      : null;

    const uploadResult = await uploadPaymentProof(paymentProofFile, submissionId);

    const payload = {
      submission_id: submissionId,
      trip_name: tripConfig.tripName,
      amount_sgd: tripConfig.amountValue,
      payee: tripConfig.payeeName,
      full_name: fullName,
      email: email,
      contact_number: contactNumber,
      company_designation: companyDesignation,
      require_invoice: requireInvoiceVal,
      invoice_name: invoiceName,
      payment_proof_path: uploadResult.path,
      payment_proof_name: uploadResult.name,
      payment_proof_type: uploadResult.type,
      payment_proof_size: uploadResult.size,
      status: "payment_confirmed"
    };

    const { error } = await supabaseClient.from("registrations").insert(payload);
    if (error) {
      throw error;
    }

    const result = {
      ok: true,
      message: "Payment confirmation submitted successfully. Our team will verify the payment and be in touch with the next steps.",
      submissionId
    };

    window.sessionStorage.setItem(
      "registrationSuccess",
      JSON.stringify({
        submissionId: result.submissionId,
        email: payload.email,
        fullName: payload.full_name,
        status: payload.status,
        amountPaid: tripConfig.amountDisplay
      })
    );

    try {
      await notifyDingTalk({
        tripName: tripConfig.tripName,
        submissionId: result.submissionId,
        fullName: payload.full_name,
        email: payload.email,
        contactNumber: payload.contact_number,
        companyName,
        designation,
        companyDesignation: payload.company_designation,
        requireInvoice: requireInvoiceVal === "yes" ? "Yes" : "No",
        invoiceName: invoiceName || "N/A",
        status: payload.status,
        amountDisplay: tripConfig.amountDisplay,
        payeeName: tripConfig.payeeName,
        paymentProofName: uploadResult.name,
        paymentProofUrl: uploadResult.url || "See Supabase storage",
        createdAt: new Date().toISOString()
      });
    } catch (notificationError) {
      console.error(notificationError);
    }

    form.reset();
    toggleInvoiceNameField();
    const successUrl = new URL(tripConfig.successPath, window.location.origin);
    successUrl.searchParams.set("submissionId", result.submissionId);
    successUrl.searchParams.set("email", payload.email);
    successUrl.searchParams.set("fullName", payload.full_name);
    successUrl.searchParams.set("status", payload.status);
    successUrl.searchParams.set("amountPaid", tripConfig.amountDisplay);
    window.location.href = successUrl.toString();
  } catch (error) {
    setMessage(error.message || "Submission failed. Please try again.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = submitButton.dataset.idleLabel || "Submit Payment Confirmation";
  }
});
