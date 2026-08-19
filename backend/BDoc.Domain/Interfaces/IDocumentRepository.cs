using BDoc.Domain.Entities;

namespace BDoc.Domain.Interfaces;

public interface IDocumentRepository
{
    Task<Document> GetByIdAsync(Guid id);
    Task<IEnumerable<Document>> GetAllAsync();
    Task CreateAsync(Document document);
    Task UpdateAsync(Document document);
    Task DeleteAsync(Guid id);
}