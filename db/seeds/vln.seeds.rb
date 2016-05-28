puts 'seed organisms and strains for Virtual Liver Network project'
# seed organisms and strains data
organisms = ['Mus musculus', 'Rattus norvegicus', 'Homo sapiens']
strains = [{ title: 'C57BL/6N', organism_title: 'Mus musculus' },
           { title: 'C57/BL6N', organism_title: 'Mus musculus' },
           { title: 'BL6/N', organism_title: 'Mus musculus' },
           { title: 'C57BL/6', organism_title: 'Mus musculus' },
           { title: 'C57/BL6J', organism_title: 'Mus musculus' },
           { title: 'Sprague-Dawley rat', organism_title: 'Rattus norvegicus' },
           { title: 'C57BL/6X', organism_title: 'Mus musculus' },
           { title: 'APC loxP (neo)', organism_title: 'Mus musculus' },
           { title: 'C57BL/6J', organism_title: 'Mus musculus' }]

organisms.each do |o_title|
  Organism.where(title: o_title).first_or_create!
end

strains.each do |s|
  Strain.where(title: s[:title], organism_id: Organism.find_by_title(s[:organism_title]).id).first_or_create!
end
