using BDoc.Domain.Entities;

namespace BDoc.Domain.Interfaces;

public interface IDocumentRepository
{
    Task<Document> GetByIdAsync(Guid id);
    Task<IEnumerable<Document>> GetAllAsync();
    Task CreateAsync(Document document);
    Task UpdateAsync(Document document);
    Task DeleteAsync(Guid id);
    Task<IEnumerable<DocumentVersion>> GetVersionsAsync(Guid documentId);
    Task<DocumentVersion?> GetVersionAsync(Guid documentId, Guid versionId);
    Task<DocumentVersion> CreateVersionAsync(DocumentVersion version);
}